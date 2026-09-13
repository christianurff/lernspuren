import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { DrawingPath, Position } from '../../types';
import { DRAWING_COLORS } from '../../theme';
import type { PenOverlayProps } from './types';
import { useT } from '../../i18n';

const STROKE_WIDTHS = [4, 8, 14]; // Seitenpunkte
const ERASER_RADIUS = 16; // Seitenpunkte
const EXPORT_SCALE = 2; // Schärfe des exportierten PNG

function parsePaths(json: string | undefined): DrawingPath[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is DrawingPath => {
      const candidate = p as Partial<DrawingPath>;
      return Array.isArray(candidate?.points) && typeof candidate?.color === 'string';
    });
  } catch {
    return [];
  }
}

function paintPath(ctx: CanvasRenderingContext2D, path: DrawingPath) {
  const { points, color, strokeWidth } = path;
  if (points.length === 0) return;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, strokeWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
}

// Abstand eines Punktes zu einer Strecke (für den Radierer)
function distanceToSegment(p: Position, a: Position, b: Position): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function pathHit(path: DrawingPath, point: Position): boolean {
  const reach = ERASER_RADIUS + path.strokeWidth / 2;
  if (path.points.length === 1) return Math.hypot(point.x - path.points[0].x, point.y - path.points[0].y) <= reach;
  for (let i = 1; i < path.points.length; i++) {
    if (distanceToSegment(point, path.points[i - 1], path.points[i]) <= reach) return true;
  }
  return false;
}

/**
 * Stift-Ebene über der ganzen Seite. Zeichnet in Seitenkoordinaten und liefert
 * am Ende ein transparentes PNG in Seitengröße plus die Pfade als JSON.
 */
export function PenOverlay({ pageWidth, pageHeight, scale, initial, onDone }: PenOverlayProps) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pathsRef = useRef<DrawingPath[] | null>(null);
  const currentRef = useRef<DrawingPath | null>(null);
  const drawingRef = useRef(false);

  const initialData = initial?.drawingData;
  const [strokeCount, setStrokeCount] = useState(() => parsePaths(initialData).length);
  const [color, setColor] = useState(DRAWING_COLORS[0].color);
  const [widthIndex, setWidthIndex] = useState(1);
  const [isEraser, setIsEraser] = useState(false);

  // Pfade erst bei Bedarf aus den Ausgangsdaten aufbauen (kein setState im Effekt nötig)
  const getPaths = useCallback((): DrawingPath[] => {
    if (pathsRef.current === null) pathsRef.current = parsePaths(initialData);
    return pathsRef.current;
  }, [initialData]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    for (const path of getPaths()) paintPath(ctx, path);
  }, [getPaths]);

  // Canvas an Seitengröße und Bildschirmauflösung angleichen
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || scale <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const factor = scale * dpr;
    canvas.style.width = `${pageWidth * scale}px`;
    canvas.style.height = `${pageHeight * scale}px`;
    canvas.width = Math.round(pageWidth * factor);
    canvas.height = Math.round(pageHeight * factor);
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(factor, 0, 0, factor, 0, 0);
    redraw();
  }, [pageWidth, pageHeight, scale, redraw]);

  const pointOf = (e: ReactPointerEvent<HTMLCanvasElement>): Position => {
    const canvas = canvasRef.current;
    if (!canvas || scale <= 0) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  };

  const eraseAt = (point: Position) => {
    const paths = getPaths();
    const remaining = paths.filter((path) => !pathHit(path, point));
    if (remaining.length === paths.length) return;
    pathsRef.current = remaining;
    setStrokeCount(remaining.length);
    redraw();
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drawingRef.current = true;
    const point = pointOf(e);
    if (isEraser) {
      eraseAt(point);
      return;
    }
    const path: DrawingPath = { points: [point], color, strokeWidth: STROKE_WIDTHS[widthIndex] };
    currentRef.current = path;
    getPaths().push(path);
    setStrokeCount(getPaths().length);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) paintPath(ctx, path);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const point = pointOf(e);
    if (isEraser) {
      eraseAt(point);
      return;
    }
    const path = currentRef.current;
    if (!path) return;
    path.points.push(point);
    // Nur das neue Segment zeichnen – das bleibt auch bei langen Strichen flüssig
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && path.points.length >= 2) {
      const n = path.points.length;
      paintPath(ctx, { points: [path.points[n - 2], path.points[n - 1]], color: path.color, strokeWidth: path.strokeWidth });
    }
  };

  const handlePointerUp = () => {
    drawingRef.current = false;
    currentRef.current = null;
  };

  const handleUndo = () => {
    const paths = getPaths();
    paths.pop();
    setStrokeCount(paths.length);
    redraw();
  };

  const handleClear = () => {
    pathsRef.current = [];
    setStrokeCount(0);
    redraw();
  };

  const handleFinish = () => {
    const paths = getPaths();
    if (paths.length === 0) {
      // Alle Striche entfernt: leeres Ergebnis (der Aufrufer löscht dann die Zeichnung)
      onDone({ imageData: '', drawingData: '[]' });
      return;
    }
    const off = document.createElement('canvas');
    off.width = Math.round(pageWidth * EXPORT_SCALE);
    off.height = Math.round(pageHeight * EXPORT_SCALE);
    const ctx = off.getContext('2d');
    if (!ctx) {
      onDone(null);
      return;
    }
    ctx.setTransform(EXPORT_SCALE, 0, 0, EXPORT_SCALE, 0, 0);
    for (const path of paths) paintPath(ctx, path);
    onDone({ imageData: off.toDataURL('image/png'), drawingData: JSON.stringify(paths) });
  };

  return (
    <div className="absolute inset-0 z-40 select-none" style={{ width: pageWidth * scale, height: pageHeight * scale }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 rounded-xl"
        style={{ touchAction: 'none', cursor: 'crosshair' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex max-w-[95vw] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-3xl border border-white/60 bg-white px-3 py-2 shadow-[0_8px_28px_rgba(30,58,95,0.22)] select-none"
      >
        <div className="flex items-center gap-1">
          {DRAWING_COLORS.map((entry) => (
            <button
              key={entry.color}
              type="button"
              aria-label={t(entry.name)}
              title={t(entry.name)}
              onClick={() => {
                setColor(entry.color);
                setIsEraser(false);
              }}
              className="flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-90"
            >
              <span
                className="block rounded-full"
                style={{
                  width: !isEraser && color === entry.color ? 34 : 26,
                  height: !isEraser && color === entry.color ? 34 : 26,
                  backgroundColor: entry.color,
                  border: !isEraser && color === entry.color ? '3px solid #FFFFFF' : 'none',
                  boxShadow: !isEraser && color === entry.color ? '0 0 0 2.5px #5B8DEF' : '0 1px 3px rgba(30,58,95,0.2)',
                }}
              />
            </button>
          ))}
        </div>

        <div className="mx-1 h-8 w-px bg-black/10" />

        <div className="flex items-center gap-1">
          {STROKE_WIDTHS.map((width, index) => (
            <button
              key={width}
              type="button"
              aria-label={t('Strichstärke {n}', { n: index + 1 })}
              onClick={() => {
                setWidthIndex(index);
                setIsEraser(false);
              }}
              className={`flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-90 ${
                !isEraser && widthIndex === index ? 'bg-primary-blue/15' : ''
              }`}
            >
              <span
                className="block rounded-full bg-ink"
                style={{ width: width + 6, height: width + 6 }}
              />
            </button>
          ))}
        </div>

        <div className="mx-1 h-8 w-px bg-black/10" />

        <button
          type="button"
          aria-label={t('Radierer')}
          onClick={() => setIsEraser((value) => !value)}
          className={`flex h-11 min-w-[44px] items-center gap-1 rounded-full px-3 text-sm font-medium transition-transform active:scale-90 ${
            isEraser ? 'bg-primary-blue text-white' : 'text-ink hover:bg-surface-light'
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m14 4 6 6-8 8H7l-3-3z" />
            <path d="M8 21h12" />
          </svg>
          {t('Radierer')}
        </button>

        <button
          type="button"
          aria-label={t('Rückgängig')}
          disabled={strokeCount === 0}
          onClick={handleUndo}
          className="flex h-11 min-w-[44px] items-center gap-1 rounded-full px-3 text-sm font-medium text-ink transition-transform hover:bg-surface-light active:scale-90 disabled:opacity-35"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 10h11a5 5 0 0 1 0 10h-3" />
            <path d="m7 6-4 4 4 4" />
          </svg>
          {t('Zurück')}
        </button>

        <button
          type="button"
          aria-label={t('Alles löschen')}
          disabled={strokeCount === 0}
          onClick={handleClear}
          className="flex h-11 min-w-[44px] items-center rounded-full px-3 text-sm font-medium text-ink-soft transition-transform hover:bg-surface-light active:scale-90 disabled:opacity-35"
        >
          {t('Alles löschen')}
        </button>

        <div className="mx-1 h-8 w-px bg-black/10" />

        <button
          type="button"
          aria-label={t('Abbrechen')}
          onClick={() => onDone(null)}
          className="flex h-11 min-w-[44px] items-center rounded-full px-4 text-sm font-medium text-ink-soft transition-transform hover:bg-surface-light active:scale-90"
        >
          {t('Abbrechen')}
        </button>

        <button
          type="button"
          aria-label={t('Fertig')}
          onClick={handleFinish}
          className="flex h-11 min-w-[44px] items-center rounded-full bg-primary-blue px-5 text-sm font-semibold text-white transition-transform hover:brightness-105 active:scale-90"
        >
          {t('Fertig')}
        </button>
      </div>
    </div>
  );
}
