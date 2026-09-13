import { create } from 'zustand';
import type { Card, CanvasEvent, Position } from '../types';
import { cardService, eventService } from '../services/db/database';
import { useCardsStore } from './useCardsStore';
import { useHistoryStore } from './useHistoryStore';

// Lernspur-Wiedergabe (wie iOS CanvasPlaybackManager):
// Spielt die Entstehung des Canvas Schritt für Schritt ab, inkl. „Zeitmaschine".

const BASE_INTERVAL_MS = 800;
export const PLAYBACK_SPEEDS = [0.5, 1, 2, 4] as const;

interface ExistenceState {
  cards: Map<string, Position>;
  zones: Set<string>;
  connections: Set<string>;
}

// Zustand nach den ersten `step` Ereignissen rekonstruieren
export function computeExistenceState(events: CanvasEvent[], step: number): ExistenceState {
  const cards = new Map<string, Position>();
  const zones = new Set<string>();
  const connections = new Set<string>();

  for (let i = 0; i < step && i < events.length; i++) {
    const e = events[i];
    switch (e.eventType) {
      case 'createCard':
        cards.set(e.targetId, e.to ?? { x: 0, y: 0 });
        break;
      case 'moveCard':
        if (cards.has(e.targetId) && e.to) cards.set(e.targetId, e.to);
        break;
      case 'deleteCard':
        cards.delete(e.targetId);
        break;
      case 'createZone':
        zones.add(e.targetId);
        break;
      case 'deleteZone':
        zones.delete(e.targetId);
        break;
      case 'createConnection':
        connections.add(e.targetId);
        break;
      case 'deleteConnection':
        connections.delete(e.targetId);
        break;
    }
  }

  return { cards, zones, connections };
}

interface PlaybackStoreState {
  isActive: boolean;
  isPlaying: boolean;
  hasEvents: boolean;
  events: CanvasEvent[];
  currentStep: number;
  speed: number;
  // Alle Karten des Projekts inkl. Papierkorb — gelöschte Karten können so
  // in der Wiedergabe wieder auftauchen (Soft-Delete sei Dank)
  allCards: Card[];

  loadEventInfo: (projectId: string) => Promise<void>;
  start: (projectId: string) => Promise<void>;
  play: () => void;
  pause: () => void;
  restart: () => void;
  stop: () => void;
  setSpeed: (speed: number) => void;
  cycleSpeed: () => void;
  // „Neustart ab hier": Canvas auf den aktuellen Wiedergabestand zurücksetzen
  // (Karten + Positionen; spätere Ereignisse werden verworfen)
  timeTravel: (projectId: string) => Promise<void>;
}

let timer: ReturnType<typeof setInterval> | null = null;

function clearTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export const usePlaybackStore = create<PlaybackStoreState>((set, get) => {
  const startTimer = () => {
    clearTimer();
    timer = setInterval(() => {
      const { currentStep, events, isPlaying } = get();
      if (!isPlaying) return;
      if (currentStep >= events.length) {
        clearTimer();
        set({ isPlaying: false });
        return;
      }
      set({ currentStep: currentStep + 1 });
    }, BASE_INTERVAL_MS / get().speed);
  };

  return {
    isActive: false,
    isPlaying: false,
    hasEvents: false,
    events: [],
    currentStep: 0,
    speed: 1,
    allCards: [],

    loadEventInfo: async (projectId: string) => {
      try {
        // Nur zählen – die Ereignisse selbst werden erst beim Start geladen
        const count = await eventService.countByProject(projectId);
        set({ hasEvents: count > 0 });
      } catch (error) {
        console.error('Failed to load event info:', error);
      }
    },

    start: async (projectId: string) => {
      try {
        const [events, allCards] = await Promise.all([
          eventService.getAllByProject(projectId),
          cardService.getAllByProjectIncludingDeleted(projectId),
        ]);
        if (events.length === 0) return;

        useCardsStore.getState().setSelectedCard(null);
        set({ isActive: true, isPlaying: true, events, allCards, currentStep: 0 });
        startTimer();
      } catch (error) {
        console.error('Failed to start playback:', error);
      }
    },

    play: () => {
      const { currentStep, events } = get();
      if (currentStep >= events.length) {
        set({ currentStep: 0 });
      }
      set({ isPlaying: true });
      startTimer();
    },

    pause: () => {
      clearTimer();
      set({ isPlaying: false });
    },

    restart: () => {
      set({ currentStep: 0, isPlaying: true });
      startTimer();
    },

    stop: () => {
      clearTimer();
      set({ isActive: false, isPlaying: false, currentStep: 0 });
    },

    setSpeed: (speed: number) => {
      set({ speed });
      if (get().isPlaying) startTimer();
    },

    cycleSpeed: () => {
      const { speed } = get();
      const index = PLAYBACK_SPEEDS.indexOf(speed as (typeof PLAYBACK_SPEEDS)[number]);
      const next = PLAYBACK_SPEEDS[(index + 1) % PLAYBACK_SPEEDS.length];
      get().setSpeed(next);
    },

    timeTravel: async (projectId: string) => {
      const { events, currentStep, allCards } = get();
      clearTimer();

      try {
        const state = computeExistenceState(events, currentStep);

        for (const card of allCards) {
          const position = state.cards.get(card.id);
          if (position) {
            if (card.isDeleted) {
              await cardService.restore(card.id);
            }
            await cardService.update(card.id, { position });
          } else if (!card.isDeleted) {
            await cardService.softDelete(card.id);
          }
        }

        // Nach Index abschneiden: genau die abgespielten Ereignisse behalten.
        // (Nach Zeitstempel würden Ereignisse mit gleicher Millisekunde überleben.)
        const keepIds = events.slice(0, currentStep).map((e) => e.id);
        await eventService.keepOnly(projectId, keepIds);

        await useCardsStore.getState().loadCards(projectId, true);
        useHistoryStore.getState().clear();

        set({
          isActive: false,
          isPlaying: false,
          currentStep: 0,
          hasEvents: currentStep > 0,
        });
      } catch (error) {
        console.error('Time travel failed:', error);
      }
    },
  };
});
