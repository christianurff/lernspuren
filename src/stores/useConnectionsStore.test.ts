import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../services/db/database';
import { useConnectionsStore } from './useConnectionsStore';

const PROJECT = 'projekt-verbinden';

beforeEach(async () => {
  await db.connections.clear();
  useConnectionsStore.setState({
    connections: [],
    pendingConnection: null,
    dragPoint: null,
    hoverTarget: null,
  });
});

describe('Verbinden ohne eigenen Modus', () => {
  it('merkt sich Quelle und Anker beim Losziehen', () => {
    useConnectionsStore.getState().startConnection('a', 'right');

    expect(useConnectionsStore.getState().pendingConnection)
      .toEqual({ sourceCardId: 'a', sourceAnchor: 'right' });
  });

  it('führt Zeigerpunkt und Andockziel mit', () => {
    const store = useConnectionsStore.getState();
    store.startConnection('a', 'right');
    store.updateConnectionDrag({ x: 120, y: 40 }, { cardId: 'b', anchor: 'left' });

    expect(useConnectionsStore.getState().dragPoint).toEqual({ x: 120, y: 40 });
    expect(useConnectionsStore.getState().hoverTarget).toEqual({ cardId: 'b', anchor: 'left' });
  });

  it('behält dieselbe hoverTarget-Referenz, solange das Ziel gleich bleibt', () => {
    const store = useConnectionsStore.getState();
    store.startConnection('a', 'right');
    store.updateConnectionDrag({ x: 120, y: 40 }, { cardId: 'b', anchor: 'left' });
    const erstes = useConnectionsStore.getState().hoverTarget;

    // Zeiger bewegt sich weiter, das Ziel bleibt dasselbe
    store.updateConnectionDrag({ x: 124, y: 44 }, { cardId: 'b', anchor: 'left' });

    expect(useConnectionsStore.getState().hoverTarget).toBe(erstes);
    expect(useConnectionsStore.getState().dragPoint).toEqual({ x: 124, y: 44 });
  });

  it('legt beim Andocken die Verbindung an und räumt den Zustand', () => {
    const store = useConnectionsStore.getState();
    store.startConnection('a', 'right');
    store.updateConnectionDrag({ x: 120, y: 40 }, { cardId: 'b', anchor: 'left' });

    const connection = useConnectionsStore.getState().completeConnection('b', 'left', PROJECT);

    expect(connection).toMatchObject({
      sourceCardId: 'a',
      targetCardId: 'b',
      sourceAnchor: 'right',
      targetAnchor: 'left',
    });
    const state = useConnectionsStore.getState();
    expect(state.connections).toHaveLength(1);
    expect(state.pendingConnection).toBeNull();
    expect(state.dragPoint).toBeNull();
    expect(state.hoverTarget).toBeNull();
  });

  it('verbindet eine Karte nicht mit sich selbst', () => {
    const store = useConnectionsStore.getState();
    store.startConnection('a', 'right');

    expect(useConnectionsStore.getState().completeConnection('a', 'left', PROJECT)).toBeNull();
    expect(useConnectionsStore.getState().connections).toHaveLength(0);
    expect(useConnectionsStore.getState().pendingConnection).toBeNull();
  });

  it('räumt beim Abbrechen alles weg', () => {
    const store = useConnectionsStore.getState();
    store.startConnection('a', 'right');
    store.updateConnectionDrag({ x: 10, y: 10 }, { cardId: 'b', anchor: 'top' });

    store.cancelConnection();

    const state = useConnectionsStore.getState();
    expect(state.pendingConnection).toBeNull();
    expect(state.dragPoint).toBeNull();
    expect(state.hoverTarget).toBeNull();
  });
});
