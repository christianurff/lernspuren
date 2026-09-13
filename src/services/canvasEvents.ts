import { v4 as uuid } from 'uuid';
import type { CanvasEventType, Position } from '../types';
import { eventService } from './db/database';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { notifyCanvasEvent } from './matheforscherProtocol';

// Lernspur: Ereignisse aufzeichnen (wie iOS CanvasEvent).
// Fehler beim Protokollieren dürfen die eigentliche Aktion nie blockieren.
export function logCanvasEvent(
  projectId: string,
  eventType: CanvasEventType,
  targetId: string,
  from?: Position,
  to?: Position
): void {
  eventService
    .add({
      id: uuid(),
      projectId,
      timestamp: Date.now(),
      eventType,
      targetId,
      from,
      to,
    })
    .then(() => {
      // Play-Button sofort einblenden, sobald das erste Ereignis existiert
      if (!usePlaybackStore.getState().hasEvents) {
        usePlaybackStore.setState({ hasEvents: true });
      }
    })
    .catch((error) => console.error('Failed to log canvas event:', error));

  // Matheforscher-Protokoll: gleicher Aufrufpunkt für alle Lernspur-Ereignisse
  // (Karten/Bereiche/Verbindungen) → matheforscher:action (+ state bei Anzahl-
  // Änderungen). No-op, wenn die App nicht eingebettet ist.
  notifyCanvasEvent(projectId, eventType, targetId, from, to);
}
