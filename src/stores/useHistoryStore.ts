import { create } from 'zustand';
import type { Card, Connection, Position, Zone } from '../types';
import {
  cardService,
  zoneService,
  connectionService,
  groupService,
  type PersistedCardGroup,
} from '../services/db/database';
import { useCardsStore } from './useCardsStore';
import { useZonesStore } from './useZonesStore';
import { useConnectionsStore } from './useConnectionsStore';

// Undo/Redo wie in der iOS-App (CanvasUndoManager): Karten verschieben/löschen,
// Bereiche löschen, Verbindungen löschen. Max. 50 Einträge.
export type HistoryEntry =
  | { type: 'moveCard'; cardId: string; from: Position; to: Position }
  | { type: 'deleteCard'; card: Card; connections: Connection[] }
  // Bereich löschen; bei gruppierten Bereichen wandert die Kartengruppe mit,
  // damit Undo Bereich UND Gruppe zurückbringt
  | { type: 'deleteZone'; zone: Zone; group?: PersistedCardGroup }
  | { type: 'deleteConnection'; connection: Connection };

const MAX_ENTRIES = 50;

interface HistoryState {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  canUndo: boolean;
  canRedo: boolean;

  record: (entry: HistoryEntry) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  clear: () => void;
}

async function restoreCard(card: Card): Promise<void> {
  // Soft-Delete rückgängig machen (Karte kommt aus dem Papierkorb zurück)
  const restored = await cardService.restore(card.id);
  const cardToAdd = restored ?? card;
  useCardsStore.setState((state) => ({
    cards: state.cards.some((c) => c.id === cardToAdd.id)
      ? state.cards
      : [...state.cards, cardToAdd],
  }));
}

async function removeCard(cardId: string): Promise<void> {
  await cardService.softDelete(cardId);
  useCardsStore.setState((state) => ({
    cards: state.cards.filter((c) => c.id !== cardId),
    selectedCardId: state.selectedCardId === cardId ? null : state.selectedCardId,
  }));
}

async function moveCard(cardId: string, position: Position): Promise<void> {
  await cardService.update(cardId, { position });
  useCardsStore.setState((state) => ({
    cards: state.cards.map((c) =>
      c.id === cardId ? { ...c, position, updatedAt: Date.now() } : c
    ),
  }));
}

async function restoreZone(zone: Zone): Promise<void> {
  await zoneService.create(zone);
  useZonesStore.setState((state) => ({ zones: [...state.zones, zone] }));
}

async function removeZone(zoneId: string): Promise<void> {
  await zoneService.delete(zoneId);
  useZonesStore.setState((state) => ({
    zones: state.zones.filter((z) => z.id !== zoneId),
    selectedZoneId: state.selectedZoneId === zoneId ? null : state.selectedZoneId,
  }));
}

async function restoreGroup(group: PersistedCardGroup): Promise<void> {
  try {
    await groupService.create(group);
  } catch (error) {
    console.error('Failed to restore group:', error);
  }
  useCardsStore.setState((state) => ({
    groups: state.groups.some((g) => g.id === group.id)
      ? state.groups
      : [...state.groups, group],
  }));
}

async function removeGroup(groupId: string): Promise<void> {
  await groupService.delete(groupId);
  useCardsStore.setState((state) => ({
    groups: state.groups.filter((g) => g.id !== groupId),
  }));
}

async function restoreConnection(connection: Connection): Promise<void> {
  await connectionService.create(connection);
  useConnectionsStore.setState((state) => ({
    connections: [...state.connections, connection],
  }));
}

async function removeConnection(connectionId: string): Promise<void> {
  await connectionService.delete(connectionId);
  useConnectionsStore.setState((state) => ({
    connections: state.connections.filter((c) => c.id !== connectionId),
  }));
}

async function applyUndo(entry: HistoryEntry): Promise<void> {
  switch (entry.type) {
    case 'moveCard':
      await moveCard(entry.cardId, entry.from);
      break;
    case 'deleteCard':
      await restoreCard(entry.card);
      break;
    case 'deleteZone':
      if (entry.group) await restoreGroup(entry.group);
      await restoreZone(entry.zone);
      break;
    case 'deleteConnection':
      await restoreConnection(entry.connection);
      break;
  }
}

async function applyRedo(entry: HistoryEntry): Promise<void> {
  switch (entry.type) {
    case 'moveCard':
      await moveCard(entry.cardId, entry.to);
      break;
    case 'deleteCard':
      await removeCard(entry.card.id);
      break;
    case 'deleteZone':
      await removeZone(entry.zone.id);
      if (entry.group) await removeGroup(entry.group.id);
      break;
    case 'deleteConnection':
      await removeConnection(entry.connection.id);
      break;
  }
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  undoStack: [],
  redoStack: [],
  canUndo: false,
  canRedo: false,

  record: (entry: HistoryEntry) => {
    set((state) => {
      const undoStack = [...state.undoStack, entry].slice(-MAX_ENTRIES);
      return { undoStack, redoStack: [], canUndo: true, canRedo: false };
    });
  },

  undo: async () => {
    const { undoStack, redoStack } = get();
    const entry = undoStack[undoStack.length - 1];
    if (!entry) return;

    const newUndo = undoStack.slice(0, -1);
    const newRedo = [...redoStack, entry];
    set({
      undoStack: newUndo,
      redoStack: newRedo,
      canUndo: newUndo.length > 0,
      canRedo: true,
    });

    try {
      await applyUndo(entry);
    } catch (error) {
      console.error('Undo failed:', error);
    }
  },

  redo: async () => {
    const { undoStack, redoStack } = get();
    const entry = redoStack[redoStack.length - 1];
    if (!entry) return;

    const newRedo = redoStack.slice(0, -1);
    const newUndo = [...undoStack, entry];
    set({
      undoStack: newUndo,
      redoStack: newRedo,
      canUndo: true,
      canRedo: newRedo.length > 0,
    });

    try {
      await applyRedo(entry);
    } catch (error) {
      console.error('Redo failed:', error);
    }
  },

  clear: () => {
    set({ undoStack: [], redoStack: [], canUndo: false, canRedo: false });
  },
}));
