/**
 * connectionTargets – Geometrie fürs Verbinden von Karten.
 *
 * Verbindungen entstehen, indem man von einem Ankerpunkt einer Karte zu einer
 * anderen zieht. Damit das auch mit dem Finger gut klappt, muss nicht exakt ein
 * Ankerpunkt getroffen werden: Es genügt, in die Nähe der Zielkarte zu kommen –
 * angedockt wird an der Kante, die dem Zeiger am nächsten liegt.
 */
import type { ConnectionAnchor, Position } from '../types';

/** Wie weit vor einer Karte das Andocken schon greift (Weltkoordinaten). */
export const ANCHOR_SNAP_PADDING = 40;

/** Eine Karte, reduziert auf das, was fürs Andocken zählt. */
export interface ConnectionCandidate {
  id: string;
  position: Position;
  size: { width: number; height: number };
}

export interface ConnectionTarget {
  cardId: string;
  anchor: ConnectionAnchor;
}

/** Punkt eines Ankers in Weltkoordinaten (Mitte der jeweiligen Kante). */
export function anchorPoint(card: ConnectionCandidate, anchor: ConnectionAnchor): Position {
  const { x, y } = card.position;
  const { width, height } = card.size;
  switch (anchor) {
    case 'top':
      return { x: x + width / 2, y };
    case 'right':
      return { x: x + width, y: y + height / 2 };
    case 'bottom':
      return { x: x + width / 2, y: y + height };
    case 'left':
      return { x, y: y + height / 2 };
  }
}

const ANCHORS: ConnectionAnchor[] = ['top', 'right', 'bottom', 'left'];

/** Der Anker der Karte, der dem Punkt am nächsten liegt. */
export function nearestAnchor(card: ConnectionCandidate, point: Position): ConnectionAnchor {
  let best: ConnectionAnchor = 'top';
  let bestDistance = Infinity;
  for (const anchor of ANCHORS) {
    const distance = squaredDistance(anchorPoint(card, anchor), point);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = anchor;
    }
  }
  return best;
}

/**
 * Sucht die Karte, an der ein Pfeil andocken würde. Karten unter dem Zeiger
 * gewinnen vor Karten, die nur im Fangbereich liegen; bei Gleichstand die
 * nächstliegende. `sourceCardId` wird übersprungen – eine Karte verbindet sich
 * nicht mit sich selbst.
 */
export function findConnectionTarget(
  point: Position,
  cards: ConnectionCandidate[],
  sourceCardId: string | null,
  snapPadding = ANCHOR_SNAP_PADDING
): ConnectionTarget | null {
  let best: ConnectionCandidate | null = null;
  let bestInside = false;
  let bestDistance = Infinity;

  for (const card of cards) {
    if (card.id === sourceCardId) continue;

    const distance = distanceToRect(card, point);
    if (distance > snapPadding) continue;

    const inside = distance === 0;
    // Karte direkt unter dem Zeiger schlägt eine nur benachbarte
    if (best && bestInside && !inside) continue;
    if (!best || (inside && !bestInside) || distance < bestDistance) {
      best = card;
      bestInside = inside;
      bestDistance = distance;
    }
  }

  if (!best) return null;
  return { cardId: best.id, anchor: nearestAnchor(best, point) };
}

/** Abstand eines Punktes zum Rechteck (0, wenn er darin liegt). */
function distanceToRect(card: ConnectionCandidate, point: Position): number {
  const dx = Math.max(card.position.x - point.x, 0, point.x - (card.position.x + card.size.width));
  const dy = Math.max(card.position.y - point.y, 0, point.y - (card.position.y + card.size.height));
  return Math.hypot(dx, dy);
}

function squaredDistance(a: Position, b: Position): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}
