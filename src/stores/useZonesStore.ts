import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { Zone, Position } from '../types';
import { zoneService, type PersistedCardGroup } from '../services/db/database';
import { logCanvasEvent } from '../services/canvasEvents';

const ZONE_COLORS = [
  'rgba(255, 209, 220, 0.4)', // Pastel Pink
  'rgba(174, 198, 207, 0.4)', // Pastel Blue
  'rgba(181, 234, 215, 0.4)', // Pastel Green
  'rgba(253, 253, 150, 0.4)', // Pastel Yellow
  'rgba(224, 187, 228, 0.4)', // Pastel Purple
  'rgba(255, 179, 71, 0.4)', // Pastel Orange
] as const;

interface ZonesState {
  zones: Zone[];
  selectedZoneId: string | null;
  draggingZoneId: string | null;
  isCreatingZone: boolean;
  zoneCreationStart: Position | null;
  minimalZoneDisplay: boolean;
  editingZoneId: string | null;

  // Constants
  zoneColors: readonly string[];

  // Display
  toggleMinimalZoneDisplay: () => void;

  // Actions
  loadZones: (projectId: string) => Promise<void>;
  createZone: (projectId: string, position: Position, width: number, height: number, color?: string, name?: string, groupId?: string) => Promise<Zone>;
  createZoneForGroup: (projectId: string, groupId: string, groupName: string, groupColor: string, position: Position, width: number, height: number) => Promise<Zone>;
  updateZone: (id: string, changes: Partial<Zone>) => Promise<void>;
  // group: optional die verknüpfte Kartengruppe, damit Undo beides wiederherstellt
  deleteZone: (id: string, group?: PersistedCardGroup) => Promise<void>;
  deleteZonesForProject: (projectId: string) => Promise<void>;
  setSelectedZone: (id: string | null) => void;

  // Zone editing
  setEditingZone: (id: string | null) => void;

  // Zone dragging
  setDraggingZone: (id: string | null) => void;

  // Zone creation mode
  startZoneCreation: () => void;
  setZoneCreationStart: (position: Position | null) => void;
  endZoneCreation: () => void;

  // Helpers
  getZoneById: (id: string) => Zone | undefined;
  getZoneByGroupId: (groupId: string) => Zone | undefined;
  getZonesForProject: (projectId: string) => Zone[];
}

export const useZonesStore = create<ZonesState>((set, get) => ({
  zones: [],
  selectedZoneId: null,
  draggingZoneId: null,
  isCreatingZone: false,
  zoneCreationStart: null,
  minimalZoneDisplay: false,
  editingZoneId: null,

  zoneColors: ZONE_COLORS,

  toggleMinimalZoneDisplay: () => {
    set((state) => ({ minimalZoneDisplay: !state.minimalZoneDisplay }));
  },

  setEditingZone: (id: string | null) => {
    set({ editingZoneId: id });
  },

  setDraggingZone: (id: string | null) => {
    set({ draggingZoneId: id });
  },

  loadZones: async (projectId: string) => {
    try {
      const zones = await zoneService.getAllByProject(projectId);
      set((state) => {
        // Keep zones from other projects, replace zones for this project
        const otherZones = state.zones.filter(z => z.projectId !== projectId);
        return { zones: [...otherZones, ...zones] };
      });
    } catch (error) {
      console.error('Failed to load zones:', error);
    }
  },

  createZone: async (projectId: string, position: Position, width: number, height: number, color?: string, name?: string, groupId?: string) => {
    const now = Date.now();
    const zone: Zone = {
      id: uuid(),
      projectId,
      name,
      color: color || ZONE_COLORS[Math.floor(Math.random() * ZONE_COLORS.length)],
      position,
      width: Math.max(100, width),
      height: Math.max(100, height),
      groupId,
      createdAt: now,
      updatedAt: now,
    };

    // Persist to IndexedDB
    try {
      await zoneService.create(zone);
    } catch (error) {
      console.error('Failed to persist zone:', error);
    }

    logCanvasEvent(projectId, 'createZone', zone.id, undefined, zone.position);

    set((state) => ({
      zones: [...state.zones, zone],
      isCreatingZone: false,
      zoneCreationStart: null,
    }));

    return zone;
  },

  createZoneForGroup: async (projectId: string, groupId: string, groupName: string, groupColor: string, position: Position, width: number, height: number) => {
    const now = Date.now();
    // Convert group color (hex) to RGBA for zone
    const hexToRgba = (hex: string, alpha: number = 0.3) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (result) {
        return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
      }
      return `rgba(200, 200, 200, ${alpha})`;
    };

    const zone: Zone = {
      id: uuid(),
      projectId,
      name: groupName,
      color: hexToRgba(groupColor),
      position,
      width: Math.max(100, width),
      height: Math.max(100, height),
      groupId,
      createdAt: now,
      updatedAt: now,
    };

    // Persist to IndexedDB
    try {
      await zoneService.create(zone);
    } catch (error) {
      console.error('Failed to persist zone for group:', error);
    }

    logCanvasEvent(projectId, 'createZone', zone.id, undefined, zone.position);

    set((state) => ({
      zones: [...state.zones, zone],
    }));

    return zone;
  },

  updateZone: async (id: string, changes: Partial<Zone>) => {
    const updatedAt = Date.now();

    // Persist to IndexedDB
    try {
      await zoneService.update(id, { ...changes, updatedAt });
    } catch (error) {
      console.error('Failed to update zone:', error);
    }

    set((state) => ({
      zones: state.zones.map((z) =>
        z.id === id ? { ...z, ...changes, updatedAt } : z
      ),
    }));
  },

  deleteZone: async (id: string, group?: PersistedCardGroup) => {
    // Für Undo festhalten (optional inkl. der zugehörigen Gruppe)
    const zone = get().zones.find((z) => z.id === id);

    // Persist to IndexedDB
    try {
      await zoneService.delete(id);
    } catch (error) {
      console.error('Failed to delete zone:', error);
    }

    set((state) => ({
      zones: state.zones.filter((z) => z.id !== id),
      selectedZoneId: state.selectedZoneId === id ? null : state.selectedZoneId,
    }));

    if (zone) {
      logCanvasEvent(zone.projectId, 'deleteZone', zone.id, zone.position);
      const { useHistoryStore } = await import('./useHistoryStore');
      useHistoryStore.getState().record({ type: 'deleteZone', zone, group });
    }
  },

  deleteZonesForProject: async (projectId: string) => {
    // Persist to IndexedDB
    try {
      await zoneService.deleteByProject(projectId);
    } catch (error) {
      console.error('Failed to delete zones for project:', error);
    }

    set((state) => ({
      zones: state.zones.filter((z) => z.projectId !== projectId),
      selectedZoneId: null,
    }));
  },

  setSelectedZone: (id: string | null) => {
    set({ selectedZoneId: id });
  },

  startZoneCreation: () => {
    set({ isCreatingZone: true, zoneCreationStart: null });
  },

  setZoneCreationStart: (position: Position | null) => {
    set({ zoneCreationStart: position });
  },

  endZoneCreation: () => {
    set({ isCreatingZone: false, zoneCreationStart: null });
  },

  getZoneById: (id: string) => {
    return get().zones.find((z) => z.id === id);
  },

  getZoneByGroupId: (groupId: string) => {
    return get().zones.find((z) => z.groupId === groupId);
  },

  getZonesForProject: (projectId: string) => {
    return get().zones.filter((z) => z.projectId === projectId);
  },
}));
