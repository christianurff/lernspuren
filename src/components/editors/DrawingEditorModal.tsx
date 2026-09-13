import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Modal } from '../common';
import { useCardsStore, useUIStore, useProjectStore } from '../../stores';
import type { DrawingCard } from '../../types';
import { useT } from '../../i18n';

interface DrawingPath {
  points: { x: number; y: number }[];
  color: string;
  strokeWidth: number;
}

interface DrawingEditorModalProps {
  card?: DrawingCard;
}

const COLORS = [
  '#1f2937', // Dark gray
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#ec4899', // Pink
];

const STROKE_WIDTHS = [2, 4, 8, 12];

// Gespeicherte Pfade einlesen (ungültige Daten ergeben eine leere Zeichnung)
function parsePaths(drawingData?: string): DrawingPath[] {
  if (!drawingData) return [];
  try {
    const parsed = JSON.parse(drawingData);
    return Array.isArray(parsed) ? (parsed as DrawingPath[]) : [];
  } catch {
    return [];
  }
}

// Zeichnet ein Teilstück (oder einen kompletten Pfad) in den Kontext
function paintPoints(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  color: string,
  strokeWidth: number
) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
}

export function DrawingEditorModal({ card }: DrawingEditorModalProps) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Pfade liegen in einer Ref: so muss beim Zeichnen nicht alles neu gerendert werden
  const pathsRef = useRef<DrawingPath[]>([]);
  const currentPathRef = useRef<DrawingPath | null>(null);
  const isDrawingRef = useRef(false);
  // Re-Render-Trigger für Undo/Löschen (Startwert aus der bestehenden Zeichnung)
  const [pathCount, setPathCount] = useState(() => parsePaths(card?.drawingData).length);
  const [currentColor, setCurrentColor] = useState(COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(STROKE_WIDTHS[1]);
  const [isErasing, setIsErasing] = useState(false);
  const [label, setLabel] = useState(card?.label || '');

  const { currentProjectId } = useProjectStore();
  const { addDrawingCard, updateCard, deleteCard } = useCardsStore();
  const { closeModal, showToast } = useUIStore();

  const isEditMode = !!card;

  // Komplette Zeichenfläche neu aufbauen (nur bei Laden/Undo/Löschen nötig)
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const path of pathsRef.current) {
      paintPoints(ctx, path.points, path.color, path.strokeWidth);
    }
  }, []);

  // Bestehende Zeichnung der Karte einlesen
  const loadedPaths = useMemo(() => parsePaths(card?.drawingData), [card?.drawingData]);

  // Zähler/Bezeichnung beim Kartenwechsel zurücksetzen (state-adjust during render)
  const [prevCardId, setPrevCardId] = useState(card?.id ?? null);
  if (prevCardId !== (card?.id ?? null)) {
    setPrevCardId(card?.id ?? null);
    setPathCount(loadedPaths.length);
    setLabel(card?.label || '');
  }

  // Pfade in die Ref übernehmen und Zeichenfläche aufbauen
  useEffect(() => {
    pathsRef.current = [...loadedPaths];
    currentPathRef.current = null;
    isDrawingRef.current = false;
    redraw();
  }, [loadedPaths, redraw]);

  const getPointerPosition = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX: number;
    let clientY: number;

    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  const handlePointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const pos = getPointerPosition(e);
    if (!pos) return;

    isDrawingRef.current = true;
    const path: DrawingPath = isErasing
      ? { points: [pos], color: '#ffffff', strokeWidth: strokeWidth * 3 }
      : { points: [pos], color: currentColor, strokeWidth };
    currentPathRef.current = path;
    pathsRef.current.push(path);
  }, [getPointerPosition, currentColor, strokeWidth, isErasing]);

  const handlePointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const path = currentPathRef.current;
    if (!isDrawingRef.current || !path) return;

    const pos = getPointerPosition(e);
    if (!pos) return;

    path.points.push(pos);
    // Nur das neue Teilstück zeichnen statt alles neu aufzubauen
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && path.points.length >= 2) {
      const n = path.points.length;
      paintPoints(ctx, [path.points[n - 2], path.points[n - 1]], path.color, path.strokeWidth);
    }
  }, [getPointerPosition]);

  const handlePointerUp = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    const path = currentPathRef.current;
    currentPathRef.current = null;
    // Einzelne Punkte (kein Strich) verwerfen
    if (path && path.points.length < 2) {
      pathsRef.current = pathsRef.current.filter((p) => p !== path);
    }
    setPathCount(pathsRef.current.length);
  }, []);

  const handleUndo = () => {
    pathsRef.current = pathsRef.current.slice(0, -1);
    setPathCount(pathsRef.current.length);
    redraw();
  };

  const handleClear = () => {
    pathsRef.current = [];
    currentPathRef.current = null;
    setPathCount(0);
    redraw();
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (pathsRef.current.length === 0) {
      showToast(t('Bitte zuerst etwas zeichnen'));
      return;
    }

    const imageData = canvas.toDataURL('image/png');
    const drawingData = JSON.stringify(pathsRef.current);

    if (isEditMode && card) {
      await updateCard(card.id, {
        // imageData mitspeichern, sonst zeigt die Karte weiterhin die alte Zeichnung
        imageData,
        drawingData,
        label: label || undefined,
      });
      showToast(t('Zeichnung gespeichert'));
    } else if (currentProjectId) {
      await addDrawingCard(currentProjectId, imageData, drawingData);
      showToast(t('Zeichnung hinzugefügt'));
    }

    closeModal();
  };

  const handleDelete = async () => {
    if (card) {
      await deleteCard(card.id);
      showToast(t('Zeichnung gelöscht'));
      closeModal();
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={closeModal}
      onSave={handleSave}
      title={isEditMode ? t('Zeichnung') : t('Neue Zeichnung')}
      size="lg"
      closeOnBackdrop={false}
    >
      <div className="space-y-4">
        {/* Label (only in edit mode) */}
        {isEditMode && (
          <div>
            <label htmlFor="drawing-label" className="block text-sm font-medium text-gray-700 mb-1">
              {t('Bezeichnung')}
            </label>
            <input
              id="drawing-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t('z.B. Skizze 1')}
              className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-pastel-blue"
            />
          </div>
        )}

        {/* Canvas */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {isEditMode ? t('Inhalt') : t('Zeichenfläche')}
          </label>
          <div className="relative bg-white rounded-2xl overflow-hidden border border-gray-200">
            <canvas
              ref={canvasRef}
              width={600}
              height={400}
              className="w-full touch-none"
              style={{ aspectRatio: '3/2' }}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp}
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={handlePointerUp}
            />
          </div>
        </div>

        {/* Drawing tools */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* Colors */}
          <div className="flex items-center gap-1">
            {COLORS.map((color) => (
              <button
                key={color}
                onClick={() => {
                  setCurrentColor(color);
                  setIsErasing(false);
                }}
                className={`w-7 h-7 rounded-full border-2 transition-transform ${
                  currentColor === color && !isErasing
                    ? 'border-gray-800 scale-110'
                    : 'border-gray-200'
                }`}
                style={{ backgroundColor: color }}
                aria-label={t('Farbe {color}', { color })}
                aria-pressed={currentColor === color && !isErasing}
              />
            ))}
          </div>

          {/* Stroke width */}
          <div className="flex items-center gap-1">
            {STROKE_WIDTHS.map((width) => (
              <button
                key={width}
                onClick={() => setStrokeWidth(width)}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                  strokeWidth === width
                    ? 'bg-pastel-blue'
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
                aria-label={t('Strichstärke {w}', { w: width })}
                aria-pressed={strokeWidth === width}
              >
                <div
                  className="rounded-full bg-gray-800"
                  style={{ width: width * 1.5, height: width * 1.5 }}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Tool buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsErasing(!isErasing)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-colors text-sm ${
              isErasing
                ? 'bg-pastel-pink text-gray-800'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            {t('Radierer')}
          </button>

          <button
            onClick={handleUndo}
            disabled={pathCount === 0}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
            {t('Rückgängig')}
          </button>

          <button
            onClick={handleClear}
            disabled={pathCount === 0}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            {t('Alles löschen')}
          </button>
        </div>

        {/* Delete link (only in edit mode) */}
        {isEditMode && (
          <div className="pt-2 border-t border-gray-100">
            <button
              onClick={handleDelete}
              className="text-red-500 hover:text-red-700 text-sm font-medium transition-colors"
            >
              {t('Karte löschen')}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
