import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { Connection, ConnectionAnchor, ConnectionLineStyle, ConnectionArrowStyle, Position } from '../types';
import type { ConnectionTarget } from '../utils/connectionTargets';
import { connectionService } from '../services/db/database';
import { logCanvasEvent } from '../services/canvasEvents';
import { useHistoryStore } from './useHistoryStore';
import { theme } from '../theme';

interface ConnectionsState {
  connections: Connection[];
  /**
   * Angefangene Verbindung: gesetzt, solange von einem Anker gezogen wird oder
   * (nach einem Tipp) auf die Zielkarte gewartet wird. Einen eigenen
   * „Verbinden-Modus" gibt es nicht mehr.
   */
  pendingConnection: {
    sourceCardId: string;
    sourceAnchor: ConnectionAnchor;
  } | null;
  /** Aktuelle Zeigerposition in Weltkoordinaten (nur für die Vorschaulinie). */
  dragPoint: Position | null;
  /** Karte und Kante, an der gerade angedockt würde. */
  hoverTarget: ConnectionTarget | null;

  // Loading
  loadConnections: (projectId: string) => Promise<void>;

  // Angefangene Verbindung
  startConnection: (cardId: string, anchor: ConnectionAnchor) => void;
  updateConnectionDrag: (point: Position | null, target: ConnectionTarget | null) => void;
  cancelConnection: () => void;
  completeConnection: (targetCardId: string, targetAnchor: ConnectionAnchor, projectId: string) => Connection | null;

  // CRUD
  createConnection: (
    projectId: string,
    sourceCardId: string,
    targetCardId: string,
    sourceAnchor: ConnectionAnchor,
    targetAnchor: ConnectionAnchor,
    options?: {
      lineStyle?: ConnectionLineStyle;
      startArrow?: ConnectionArrowStyle;
      endArrow?: ConnectionArrowStyle;
      color?: string;
      strokeWidth?: number;
    }
  ) => Connection;
  updateConnection: (id: string, changes: Partial<Connection>) => void;
  deleteConnection: (id: string) => void;
  deleteConnectionsForCard: (cardId: string) => void;
  deleteConnectionsForProject: (projectId: string) => void;

  // Helpers
  getConnectionById: (id: string) => Connection | undefined;
  getConnectionsForProject: (projectId: string) => Connection[];
  getConnectionsForCard: (cardId: string) => Connection[];
}

export const useConnectionsStore = create<ConnectionsState>((set, get) => ({
  connections: [],
  pendingConnection: null,
  dragPoint: null,
  hoverTarget: null,

  loadConnections: async (projectId: string) => {
    try {
      const loaded = await connectionService.getAllByProject(projectId);
      set((state) => ({
        connections: [
          ...state.connections.filter((c) => c.projectId !== projectId),
          ...loaded,
        ],
      }));
    } catch (error) {
      console.error('Failed to load connections:', error);
    }
  },

  startConnection: (cardId: string, anchor: ConnectionAnchor) => {
    set({
      pendingConnection: { sourceCardId: cardId, sourceAnchor: anchor },
      dragPoint: null,
      hoverTarget: null,
    });
  },

  updateConnectionDrag: (point: Position | null, target: ConnectionTarget | null) => {
    const { hoverTarget } = get();
    // hoverTarget nur bei echter Änderung neu setzen – daran hängen alle Karten
    const sameTarget =
      hoverTarget?.cardId === target?.cardId && hoverTarget?.anchor === target?.anchor;
    set(sameTarget ? { dragPoint: point } : { dragPoint: point, hoverTarget: target });
  },

  cancelConnection: () => {
    set({ pendingConnection: null, dragPoint: null, hoverTarget: null });
  },

  completeConnection: (targetCardId: string, targetAnchor: ConnectionAnchor, projectId: string) => {
    const { pendingConnection, createConnection } = get();
    if (!pendingConnection) return null;

    // Don't connect card to itself
    if (pendingConnection.sourceCardId === targetCardId) {
      set({ pendingConnection: null, dragPoint: null, hoverTarget: null });
      return null;
    }

    const connection = createConnection(
      projectId,
      pendingConnection.sourceCardId,
      targetCardId,
      pendingConnection.sourceAnchor,
      targetAnchor
    );

    set({ pendingConnection: null, dragPoint: null, hoverTarget: null });
    return connection;
  },

  createConnection: (
    projectId: string,
    sourceCardId: string,
    targetCardId: string,
    sourceAnchor: ConnectionAnchor,
    targetAnchor: ConnectionAnchor,
    options = {}
  ) => {
    const now = Date.now();
    const connection: Connection = {
      id: uuid(),
      projectId,
      sourceCardId,
      targetCardId,
      sourceAnchor,
      targetAnchor,
      lineStyle: options.lineStyle || 'curved',
      startArrow: options.startArrow || 'none',
      endArrow: options.endArrow || 'arrow',
      color: options.color || theme.primaryBlue,
      strokeWidth: options.strokeWidth || 2,
      createdAt: now,
      updatedAt: now,
    };

    connectionService.create(connection).catch((error) => {
      console.error('Failed to persist connection:', error);
    });

    logCanvasEvent(projectId, 'createConnection', connection.id);

    set((state) => ({
      connections: [...state.connections, connection],
    }));

    return connection;
  },

  updateConnection: (id: string, changes: Partial<Connection>) => {
    connectionService.update(id, { ...changes, updatedAt: Date.now() }).catch((error) => {
      console.error('Failed to persist connection update:', error);
    });

    set((state) => ({
      connections: state.connections.map((c) =>
        c.id === id ? { ...c, ...changes, updatedAt: Date.now() } : c
      ),
    }));
  },

  deleteConnection: (id: string) => {
    const connection = get().connections.find((c) => c.id === id);
    if (connection) {
      logCanvasEvent(connection.projectId, 'deleteConnection', connection.id);
      useHistoryStore.getState().record({ type: 'deleteConnection', connection });
    }

    connectionService.delete(id).catch((error) => {
      console.error('Failed to delete connection:', error);
    });

    set((state) => ({
      connections: state.connections.filter((c) => c.id !== id),
    }));
  },

  deleteConnectionsForCard: (cardId: string) => {
    connectionService.deleteByCard(cardId).catch((error) => {
      console.error('Failed to delete connections for card:', error);
    });

    set((state) => ({
      connections: state.connections.filter(
        (c) => c.sourceCardId !== cardId && c.targetCardId !== cardId
      ),
    }));
  },

  deleteConnectionsForProject: (projectId: string) => {
    connectionService.deleteByProject(projectId).catch((error) => {
      console.error('Failed to delete connections for project:', error);
    });

    set((state) => ({
      connections: state.connections.filter((c) => c.projectId !== projectId),
    }));
  },

  getConnectionById: (id: string) => {
    return get().connections.find((c) => c.id === id);
  },

  getConnectionsForProject: (projectId: string) => {
    return get().connections.filter((c) => c.projectId === projectId);
  },

  getConnectionsForCard: (cardId: string) => {
    return get().connections.filter(
      (c) => c.sourceCardId === cardId || c.targetCardId === cardId
    );
  },
}));
