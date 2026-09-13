import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { Scene, SceneCardState, SceneZoneState, Position } from '../types';
import { sceneService } from '../services/db/database';

interface ScenesState {
  scenes: Scene[];
  selectedSceneId: string | null;
  isScenesPanelOpen: boolean;

  // Actions
  loadScenes: (projectId: string) => Promise<void>;
  openScenesPanel: () => void;
  closeScenesPanel: () => void;
  toggleScenesPanel: () => void;

  createScene: (
    projectId: string,
    name: string,
    cardStates: SceneCardState[],
    zoneStates: SceneZoneState[],
    canvasPosition: Position,
    canvasScale: number
  ) => Scene;
  updateScene: (id: string, changes: Partial<Scene>) => void;
  deleteScene: (id: string) => void;
  renameScene: (id: string, name: string) => void;

  // Helpers
  getSceneById: (id: string) => Scene | undefined;
  getScenesForProject: (projectId: string) => Scene[];
  setSelectedScene: (id: string | null) => void;
}

export const useScenesStore = create<ScenesState>((set, get) => ({
  scenes: [],
  selectedSceneId: null,
  isScenesPanelOpen: false,

  loadScenes: async (projectId: string) => {
    try {
      const loaded = await sceneService.getAllByProject(projectId);
      set((state) => ({
        scenes: [...state.scenes.filter((s) => s.projectId !== projectId), ...loaded],
      }));
    } catch (error) {
      console.error('Failed to load scenes:', error);
    }
  },

  openScenesPanel: () => {
    set({ isScenesPanelOpen: true });
  },

  closeScenesPanel: () => {
    set({ isScenesPanelOpen: false });
  },

  toggleScenesPanel: () => {
    set((state) => ({ isScenesPanelOpen: !state.isScenesPanelOpen }));
  },

  createScene: (
    projectId: string,
    name: string,
    cardStates: SceneCardState[],
    zoneStates: SceneZoneState[],
    canvasPosition: Position,
    canvasScale: number
  ) => {
    const now = Date.now();
    const scene: Scene = {
      id: uuid(),
      projectId,
      name,
      cardStates,
      zoneStates,
      canvasPosition,
      canvasScale,
      createdAt: now,
      updatedAt: now,
    };

    sceneService.create(scene).catch((error) => {
      console.error('Failed to persist scene:', error);
    });

    set((state) => ({
      scenes: [...state.scenes, scene],
    }));

    return scene;
  },

  updateScene: (id: string, changes: Partial<Scene>) => {
    sceneService.update(id, changes).catch((error) => {
      console.error('Failed to persist scene update:', error);
    });

    set((state) => ({
      scenes: state.scenes.map((s) =>
        s.id === id ? { ...s, ...changes, updatedAt: Date.now() } : s
      ),
    }));
  },

  deleteScene: (id: string) => {
    sceneService.delete(id).catch((error) => {
      console.error('Failed to delete scene:', error);
    });

    set((state) => ({
      scenes: state.scenes.filter((s) => s.id !== id),
      selectedSceneId: state.selectedSceneId === id ? null : state.selectedSceneId,
    }));
  },

  renameScene: (id: string, name: string) => {
    sceneService.update(id, { name }).catch((error) => {
      console.error('Failed to persist scene rename:', error);
    });

    set((state) => ({
      scenes: state.scenes.map((s) =>
        s.id === id ? { ...s, name, updatedAt: Date.now() } : s
      ),
    }));
  },

  getSceneById: (id: string) => {
    return get().scenes.find((s) => s.id === id);
  },

  getScenesForProject: (projectId: string) => {
    return get().scenes.filter((s) => s.projectId === projectId);
  },

  setSelectedScene: (id: string | null) => {
    set({ selectedSceneId: id });
  },
}));
