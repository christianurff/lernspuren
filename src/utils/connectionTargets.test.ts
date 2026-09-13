import { describe, expect, it } from 'vitest';
import {
  ANCHOR_SNAP_PADDING,
  anchorPoint,
  findConnectionTarget,
  nearestAnchor,
  type ConnectionCandidate,
} from './connectionTargets';

const box = (id: string, x: number, y: number): ConnectionCandidate => ({
  id,
  position: { x, y },
  size: { width: 200, height: 100 },
});

describe('anchorPoint', () => {
  const card = box('a', 100, 200);

  it('legt die Anker auf die Kantenmitten', () => {
    expect(anchorPoint(card, 'top')).toEqual({ x: 200, y: 200 });
    expect(anchorPoint(card, 'right')).toEqual({ x: 300, y: 250 });
    expect(anchorPoint(card, 'bottom')).toEqual({ x: 200, y: 300 });
    expect(anchorPoint(card, 'left')).toEqual({ x: 100, y: 250 });
  });
});

describe('nearestAnchor', () => {
  const card = box('a', 0, 0); // 200×100 bei (0,0)

  it('wählt die Kante, der der Punkt am nächsten liegt', () => {
    expect(nearestAnchor(card, { x: 100, y: -30 })).toBe('top');
    expect(nearestAnchor(card, { x: 240, y: 50 })).toBe('right');
    expect(nearestAnchor(card, { x: 100, y: 130 })).toBe('bottom');
    expect(nearestAnchor(card, { x: -30, y: 50 })).toBe('left');
  });

  it('entscheidet auch für Punkte innerhalb der Karte', () => {
    // dicht unter der Oberkante
    expect(nearestAnchor(card, { x: 100, y: 10 })).toBe('top');
    // dicht an der linken Kante
    expect(nearestAnchor(card, { x: 10, y: 50 })).toBe('left');
  });
});

describe('findConnectionTarget', () => {
  const cards = [box('quelle', 0, 0), box('ziel', 400, 0)];

  it('findet die Karte unter dem Zeiger und die nächste Kante', () => {
    // dicht hinter der linken Kante von 'ziel'
    expect(findConnectionTarget({ x: 420, y: 50 }, cards, 'quelle'))
      .toEqual({ cardId: 'ziel', anchor: 'left' });
    // dicht unter der Oberkante
    expect(findConnectionTarget({ x: 500, y: 10 }, cards, 'quelle'))
      .toEqual({ cardId: 'ziel', anchor: 'top' });
  });

  it('dockt schon kurz vor der Karte an', () => {
    // 20 Punkte links neben 'ziel' – innerhalb des Fangbereichs
    expect(findConnectionTarget({ x: 380, y: 50 }, cards, 'quelle'))
      .toEqual({ cardId: 'ziel', anchor: 'left' });
  });

  it('liefert nichts, wenn der Zeiger weit weg ist', () => {
    expect(findConnectionTarget({ x: 400 - ANCHOR_SNAP_PADDING - 30, y: 50 }, cards, 'quelle'))
      .toBeNull();
  });

  it('ignoriert die Quellkarte', () => {
    expect(findConnectionTarget({ x: 100, y: 50 }, cards, 'quelle')).toBeNull();
  });

  it('nimmt bei mehreren Kandidaten den nächstliegenden', () => {
    const drei = [box('quelle', 0, 0), box('nah', 400, 0), box('fern', 420, 300)];
    expect(findConnectionTarget({ x: 405, y: 40 }, drei, 'quelle')?.cardId).toBe('nah');
  });

  it('bevorzugt die Karte unter dem Zeiger vor einer nur nahen', () => {
    // 'unten' liegt direkt unter dem Zeiger, 'oben' nur im Fangbereich
    const zwei = [box('oben', 400, 0), box('unten', 400, 120)];
    expect(findConnectionTarget({ x: 500, y: 170 }, zwei, 'quelle')?.cardId).toBe('unten');
  });
});
