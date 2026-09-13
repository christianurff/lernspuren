import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { BackgroundText, Position } from '../types';
import { backgroundTextService } from '../services/db/database';

interface BackgroundTextsState {
  texts: BackgroundText[];

  // Actions
  loadBackgroundTexts: (projectId: string) => Promise<void>;
  addText: (
    projectId: string,
    text: string,
    position: Position,
    fontSize: number,
    color: string
  ) => Promise<BackgroundText>;
  updateText: (id: string, changes: Partial<BackgroundText>) => Promise<void>;
  deleteText: (id: string) => Promise<void>;

  // Helpers
  getTextsForProject: (projectId: string) => BackgroundText[];
}

export const useBackgroundTextsStore = create<BackgroundTextsState>((set, get) => ({
  texts: [],

  loadBackgroundTexts: async (projectId: string) => {
    try {
      const texts = await backgroundTextService.getAllByProject(projectId);
      set((state) => {
        // Einträge anderer Projekte behalten, nur dieses Projekt ersetzen
        const others = state.texts.filter((t) => t.projectId !== projectId);
        return { texts: [...others, ...texts] };
      });
    } catch (error) {
      console.error('Failed to load background texts:', error);
    }
  },

  addText: async (
    projectId: string,
    text: string,
    position: Position,
    fontSize: number,
    color: string
  ) => {
    const now = Date.now();
    const backgroundText: BackgroundText = {
      id: uuid(),
      projectId,
      text,
      position,
      fontSize,
      color,
      createdAt: now,
      updatedAt: now,
    };

    // In IndexedDB persistieren
    try {
      await backgroundTextService.create(backgroundText);
    } catch (error) {
      console.error('Failed to persist background text:', error);
    }

    set((state) => ({ texts: [...state.texts, backgroundText] }));

    return backgroundText;
  },

  updateText: async (id: string, changes: Partial<BackgroundText>) => {
    const updatedAt = Date.now();

    // In IndexedDB persistieren
    try {
      await backgroundTextService.update(id, { ...changes, updatedAt });
    } catch (error) {
      console.error('Failed to update background text:', error);
    }

    set((state) => ({
      texts: state.texts.map((t) =>
        t.id === id ? { ...t, ...changes, updatedAt } : t
      ),
    }));
  },

  deleteText: async (id: string) => {
    // Aus IndexedDB entfernen
    try {
      await backgroundTextService.delete(id);
    } catch (error) {
      console.error('Failed to delete background text:', error);
    }

    set((state) => ({ texts: state.texts.filter((t) => t.id !== id) }));
  },

  getTextsForProject: (projectId: string) => {
    return get().texts.filter((t) => t.projectId === projectId);
  },
}));
