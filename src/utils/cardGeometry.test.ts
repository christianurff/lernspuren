import { describe, expect, it } from 'vitest';
import type { Card } from '../types';
import {
  cardDimensions,
  clampCardEdge,
  freeTextFontSize,
  measureTextHeight,
  naturalSize,
  resizeFreeSize,
  textEditRect,
  COMPACT_SIZE,
  MAX_CARD_EDGE,
  MIN_CARD_EDGE,
} from './cardGeometry';

// Messkontext für Texttests: jedes Zeichen ist genau 10 Punkte breit
const measurer = { measureText: (text: string) => ({ width: text.length * 10 }) };

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    projectId: 'p1',
    type: 'photo',
    size: 'medium',
    position: { x: 0, y: 0 },
    zIndex: 0,
    imageData: 'data:image/png;base64,AA',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as Card;
}

describe('cardDimensions', () => {
  it('liefert im quadratischen Modus die Stufengröße', () => {
    expect(cardDimensions(card({ size: 'large' }), { freeLayout: false, compact: false }))
      .toEqual({ width: 280, height: 280 });
  });

  it('nutzt freeSize nur im freien Modus', () => {
    const c = card({ freeSize: { width: 300, height: 150 } });
    expect(cardDimensions(c, { freeLayout: true, compact: false })).toEqual({ width: 300, height: 150 });
    expect(cardDimensions(c, { freeLayout: false, compact: false })).toEqual({ width: 200, height: 200 });
  });

  it('fällt im freien Modus ohne freeSize auf die Stufengröße zurück', () => {
    expect(cardDimensions(card({ size: 'small' }), { freeLayout: true, compact: false }))
      .toEqual({ width: 140, height: 140 });
  });

  it('bleibt in der kompakten Ansicht quadratisch, auch mit freeSize', () => {
    const c = card({ freeSize: { width: 300, height: 150 } });
    expect(cardDimensions(c, { freeLayout: true, compact: true })).toEqual(COMPACT_SIZE);
  });
});

describe('naturalSize', () => {
  it('macht aus einem Querformat-Foto eine breite Karte', () => {
    expect(naturalSize(card(), 2, 200)).toEqual({ width: 200, height: 100 });
  });

  it('macht aus einem Hochformat-Foto eine hohe Karte', () => {
    expect(naturalSize(card(), 0.5, 200)).toEqual({ width: 200, height: 400 });
  });

  it('bleibt ohne Seitenverhältnis quadratisch', () => {
    expect(naturalSize(card(), null, 140)).toEqual({ width: 140, height: 140 });
  });

  it('gibt Audiokarten eine Player-Zeile', () => {
    expect(naturalSize(card({ type: 'audio', audioData: 'x' } as Partial<Card>), null, 200))
      .toEqual({ width: 240, height: 120 });
  });

  it('gibt Aufgabenkarten ein Standardrechteck', () => {
    expect(naturalSize(card({ type: 'task', taskText: '', hints: [], checklist: [] } as Partial<Card>), null, 200))
      .toEqual({ width: 320, height: 240 });
  });
});

describe('resizeFreeSize', () => {
  it('hält beim Foto das Seitenverhältnis', () => {
    const c = card({ freeSize: { width: 200, height: 100 } });
    expect(resizeFreeSize(c, 400, 999, { width: 200, height: 100 }))
      .toEqual({ width: 400, height: 200 });
  });

  it('lässt Audio in beide Richtungen frei', () => {
    const c = card({ type: 'audio', audioData: 'x', freeSize: { width: 240, height: 120 } } as Partial<Card>);
    expect(resizeFreeSize(c, 300, 90, { width: 240, height: 120 }))
      .toEqual({ width: 300, height: 90 });
  });

  it('begrenzt nach unten und oben', () => {
    const c = card({
      type: 'task',
      taskText: '',
      hints: [],
      checklist: [],
      freeSize: { width: 320, height: 240 },
    } as Partial<Card>);
    expect(resizeFreeSize(c, 5, 99999, { width: 320, height: 240 }))
      .toEqual({ width: MIN_CARD_EDGE, height: MAX_CARD_EDGE });
  });
});

describe('freeTextFontSize', () => {
  it('trifft bei Breite 200 die bisherige mittlere Schriftgröße', () => {
    expect(freeTextFontSize(200)).toBe(15);
  });

  it('rastet an den Grenzen', () => {
    expect(freeTextFontSize(20)).toBe(11);
    expect(freeTextFontSize(5000)).toBe(64);
  });
});

describe('measureTextHeight', () => {
  it('rechnet eine Zeile mit der Zeilenhöhe', () => {
    // 'Hallo' = 50 Punkte < 100 → eine Zeile
    expect(measureTextHeight('Hallo', 100, 20, measurer)).toBe(26);
  });

  it('wächst mit der Zeilenzahl', () => {
    // 'Hallo liebe Welt' bricht bei 100 Punkten auf zwei Zeilen um
    expect(measureTextHeight('Hallo liebe Welt', 100, 20, measurer)).toBe(52);
  });

  it('gibt leerem Text eine Zeile', () => {
    expect(measureTextHeight('', 100, 20, measurer)).toBe(26);
  });
});

describe('clampCardEdge', () => {
  it('rundet und begrenzt', () => {
    expect(clampCardEdge(199.6)).toBe(200);
    expect(clampCardEdge(-5)).toBe(MIN_CARD_EDGE);
    expect(clampCardEdge(99999)).toBe(MAX_CARD_EDGE);
  });
});

describe('textEditRect', () => {
  const text = card({ type: 'text', content: 'Hallo', size: 'medium' });

  it('setzt das Feld in den Innenabstand der quadratischen Karte', () => {
    expect(textEditRect(text, { x: 100, y: 50 }, { freeLayout: false, compact: false })).toEqual({
      position: { x: 108, y: 62 },
      size: { width: 184, height: 176 },
    });
  });

  it('bearbeitet randlosen Text im freien Modus bündig', () => {
    const frei = card({ type: 'text', content: 'Hallo', freeSize: { width: 320, height: 40 } });
    expect(textEditRect(frei, { x: 10, y: 20 }, { freeLayout: true, compact: false })).toEqual({
      position: { x: 10, y: 20 },
      size: { width: 320, height: 40 },
    });
  });

  it('nutzt in der kompakten Ansicht den schmalen Rand', () => {
    expect(textEditRect(text, { x: 0, y: 0 }, { freeLayout: false, compact: true })).toEqual({
      position: { x: 6, y: 6 },
      size: { width: COMPACT_SIZE.width - 12, height: COMPACT_SIZE.height - 12 },
    });
  });
});
