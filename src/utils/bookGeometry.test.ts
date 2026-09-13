import { describe, expect, it } from 'vitest';
import {
  angleFromCenter,
  clampToPage,
  defaultItemRect,
  fitPageScale,
  resizeFromCorner,
  snapRotation,
  snapToCenter,
} from './bookGeometry';

describe('fitPageScale', () => {
  it('passt eine Hochformatseite in einen Querformat-Viewport', () => {
    expect(fitPageScale(768, 1024, 1180, 700, 0)).toBeCloseTo(700 / 1024);
  });

  it('berücksichtigt den Innenabstand', () => {
    expect(fitPageScale(1024, 1024, 1024, 1024, 12)).toBeCloseTo(1000 / 1024);
  });
});

describe('clampToPage', () => {
  it('lässt ein Item nie vollständig aus der Seite verschwinden', () => {
    const r = clampToPage({ x: -500, y: 2000, width: 200, height: 100 }, 768, 1024);
    expect(r.x).toBe(-160); // 40 Punkte bleiben sichtbar
    expect(r.y).toBe(1024 - 40);
  });

  it('verändert Items innerhalb der Seite nicht', () => {
    const r = clampToPage({ x: 10, y: 20, width: 200, height: 100 }, 768, 1024);
    expect(r).toEqual({ x: 10, y: 20, width: 200, height: 100 });
  });
});

describe('snapToCenter', () => {
  it('rastet nahe der Seitenmitte ein', () => {
    const { rect, snapX, snapY } = snapToCenter({ x: 290, y: 0, width: 200, height: 100 }, 768, 1024);
    expect(snapX).toBe(true);
    expect(snapY).toBe(false);
    expect(rect.x).toBe(284);
  });
});

describe('resizeFromCorner', () => {
  const original = { x: 100, y: 100, width: 200, height: 100 };

  it('hält bei keepAspect das Seitenverhältnis und fixiert die Gegenecke', () => {
    const r = resizeFromCorner(original, 'se', 100, 0, true);
    expect(r.width).toBe(300);
    expect(r.height).toBe(150);
    expect(r.x).toBe(100);
    expect(r.y).toBe(100);
  });

  it('fixiert bei nw die untere rechte Ecke', () => {
    const r = resizeFromCorner(original, 'nw', 50, 50, false);
    expect(r.x + r.width).toBe(300);
    expect(r.y + r.height).toBe(200);
    expect(r.width).toBe(150);
    expect(r.height).toBe(50);
  });

  it('unterschreitet die Mindestgröße nicht', () => {
    const r = resizeFromCorner(original, 'se', -500, -500, false);
    expect(r.width).toBe(48);
    expect(r.height).toBe(48);
  });

  // Bildschirmposition einer Rechteck-Ecke bei Drehung um den Mittelpunkt
  const rotatedCorner = (
    rect: { x: number; y: number; width: number; height: number },
    corner: 'nw' | 'ne' | 'sw' | 'se',
    deg: number
  ) => {
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const px = corner === 'nw' || corner === 'sw' ? rect.x : rect.x + rect.width;
    const py = corner === 'nw' || corner === 'ne' ? rect.y : rect.y + rect.height;
    const rad = (deg * Math.PI) / 180;
    return {
      x: cx + (px - cx) * Math.cos(rad) - (py - cy) * Math.sin(rad),
      y: cy + (px - cx) * Math.sin(rad) + (py - cy) * Math.cos(rad),
    };
  };

  it('lässt den gedrehten Ankerpunkt (Gegenecke) an Ort und Stelle', () => {
    for (const rotation of [30, 90, 180, 245]) {
      const before = rotatedCorner(original, 'nw', rotation);
      const r = resizeFromCorner(original, 'se', 80, 40, false, rotation);
      const after = rotatedCorner(r, 'nw', rotation);
      expect(after.x).toBeCloseTo(before.x, 6);
      expect(after.y).toBeCloseTo(before.y, 6);
    }
  });

  it('verhält sich ohne Drehung unverändert', () => {
    expect(resizeFromCorner(original, 'se', 100, 0, true, 0)).toEqual(
      resizeFromCorner(original, 'se', 100, 0, true)
    );
  });
});

describe('Rotation', () => {
  it('berechnet 90° rechts vom Mittelpunkt', () => {
    expect(angleFromCenter({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(90);
  });

  it('rastet nahe 0/90/180/270 ein', () => {
    expect(snapRotation(357)).toBe(0);
    expect(snapRotation(93)).toBe(90);
    expect(snapRotation(45)).toBe(45);
  });
});

describe('defaultItemRect', () => {
  it('skaliert große Bilder auf 70 % der Seite und zentriert sie', () => {
    const r = defaultItemRect(768, 1024, 4000, 3000, 0.7);
    expect(r.width).toBeLessThanOrEqual(768 * 0.7 + 1);
    expect(r.x + r.width / 2).toBeCloseTo(384, 0);
  });
});
