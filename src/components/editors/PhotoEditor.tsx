import { useState, useRef, useEffect, useCallback } from 'react';
import { Modal, ImageCropView } from '../common';
import type { PhotoCard, CardSize } from '../../types';
import { CARD_SIZES, FRAME_COLORS } from '../../types';
import { DRAWING_COLORS } from '../../theme';
import { useCardsStore, useUIStore, useProjectStore } from '../../stores';
import { clampCardEdge } from '../../utils/cardGeometry';
import { useT } from '../../i18n';

interface PhotoEditorProps {
  card: PhotoCard;
}

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  color: string;
  width: number; // Strichstärke in Displaygröße (px)
  points: Point[];
}

// Strichstärke-Stufen (Displaygröße, beim Export auf Naturauflösung skaliert)
const STROKE_WIDTHS = [2, 4, 8];

// Zeichnet einen einzelnen Strich in den gegebenen 2D-Kontext (Koordinaten bereits skaliert)
function paintStroke(ctx: CanvasRenderingContext2D, points: Point[], color: string, width: number) {
  if (points.length === 0) return;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (points.length === 1) {
    const p = points[0];
    ctx.beginPath();
    ctx.arc(p.x, p.y, width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
}

export function PhotoEditor({ card }: PhotoEditorProps) {
  const t = useT();
  const [label, setLabel] = useState(card.label || '');

  const { updateCard, deleteCard, changeSize, removeFromStack } = useCardsStore();
  // Nach dem Zuschneiden zeigt die Vorschau sonst noch das Bild von vor dem
  // Öffnen (die Karte kommt als Modal-Daten herein und wird nicht nachgereicht).
  const liveImageData = useCardsStore(
    (state) => (state.cards.find((c) => c.id === card.id) as PhotoCard | undefined)?.imageData
  ) ?? card.imageData;
  const { closeModal, showToast } = useUIStore();

  // Im freien Modus zieht man die Größe direkt an der Karte – die drei Stufen
  // hätten dort keine Wirkung.
  const isFreeLayout = useProjectStore((state) =>
    state.projects.find((p) => p.id === card.projectId)?.cardLayout === 'free'
  );

  // Annotation-State
  const [drawMode, setDrawMode] = useState(false);
  const [cropMode, setCropMode] = useState(false);
  const [color, setColor] = useState(DRAWING_COLORS[0].color);
  const [widthIndex, setWidthIndex] = useState(1); // Standard: mittel (4)
  const [strokeCount, setStrokeCount] = useState(0); // Re-Render-Trigger für Undo/Anzeige
  const [overlayRemoved, setOverlayRemoved] = useState(false);
  const [overlayLoaded, setOverlayLoaded] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const drawingRef = useRef(false);
  const overlayImgRef = useRef<HTMLImageElement | null>(null);
  const displaySizeRef = useRef({ w: 0, h: 0 });

  // Zustand beim Kartenwechsel zurücksetzen (state-adjust during render, wie TextEditor)
  const [prevCardId, setPrevCardId] = useState(card.id);
  if (prevCardId !== card.id) {
    setPrevCardId(card.id);
    setLabel(card.label || '');
    setDrawMode(false);
    setCropMode(false);
    setStrokeCount(0);
    setOverlayRemoved(false);
    setOverlayLoaded(false);
  }

  // Zeichen-Refs beim Kartenwechsel leeren (Refs gehören nicht in den Render)
  useEffect(() => {
    strokesRef.current = [];
    currentStrokeRef.current = null;
    drawingRef.current = false;
    overlayImgRef.current = null;
  }, [card.id]);

  // Bestehendes Annotation-Overlay laden (in Naturauflösung des Fotos)
  useEffect(() => {
    if (!card.annotationData) return;
    const img = new Image();
    img.onload = () => {
      overlayImgRef.current = img;
      setOverlayLoaded(true);
    };
    img.src = card.annotationData;
  }, [card.annotationData]);

  // Canvas komplett neu zeichnen (altes Overlay zuerst, dann alle Striche)
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h } = displaySizeRef.current;
    ctx.clearRect(0, 0, w, h);
    if (overlayImgRef.current && !overlayRemoved) {
      ctx.drawImage(overlayImgRef.current, 0, 0, w, h);
    }
    for (const s of strokesRef.current) {
      paintStroke(ctx, s.points, s.color, s.width);
    }
  }, [overlayRemoved]);

  // Canvas-Größe exakt an die dargestellte Bildgröße angleichen (inkl. DPR für scharfe Linien)
  const syncCanvasSize = useCallback(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    const w = img.clientWidth;
    const h = img.clientHeight;
    if (w === 0 || h === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    displaySizeRef.current = { w, h };
    redraw();
  }, [redraw]);

  // Im Zeichenmodus Canvas synchronisieren und auf Größenänderungen reagieren
  useEffect(() => {
    if (!drawMode) return;
    syncCanvasSize();
    window.addEventListener('resize', syncCanvasSize);
    return () => window.removeEventListener('resize', syncCanvasSize);
  }, [drawMode, syncCanvasSize]);

  // Bei geladenem/entferntem Overlay im Zeichenmodus neu zeichnen
  useEffect(() => {
    if (drawMode) redraw();
  }, [overlayLoaded, overlayRemoved, drawMode, redraw]);

  const getPoint = (e: React.PointerEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!drawMode) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drawingRef.current = true;
    const stroke: Stroke = {
      color,
      width: STROKE_WIDTHS[widthIndex],
      points: [getPoint(e)],
    };
    currentStrokeRef.current = stroke;
    strokesRef.current.push(stroke);
    redraw();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drawingRef.current || !currentStrokeRef.current) return;
    e.preventDefault();
    const stroke = currentStrokeRef.current;
    stroke.points.push(getPoint(e));
    // Inkrementell nur das letzte Segment zeichnen (flüssiger)
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && stroke.points.length >= 2) {
      const n = stroke.points.length;
      paintStroke(ctx, [stroke.points[n - 2], stroke.points[n - 1]], stroke.color, stroke.width);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    drawingRef.current = false;
    currentStrokeRef.current = null;
    setStrokeCount(strokesRef.current.length);
  };

  const handleUndo = () => {
    strokesRef.current.pop();
    setStrokeCount(strokesRef.current.length);
    redraw();
  };

  const handleClearAll = () => {
    strokesRef.current = [];
    setStrokeCount(0);
    setOverlayRemoved(true); // löst redraw über Effect aus
  };

  const handleRemoveAnnotations = () => {
    strokesRef.current = [];
    setStrokeCount(0);
    setOverlayRemoved(true);
    redraw();
  };

  const hasAnnotation = strokeCount > 0 || (overlayLoaded && !overlayRemoved);

  // Annotation als transparentes PNG in Naturauflösung exportieren
  const buildAnnotationData = (): string | undefined => {
    const hasStrokes = strokesRef.current.length > 0;
    const keepOverlay = !!overlayImgRef.current && !overlayRemoved;
    if (!hasStrokes && !keepOverlay) return undefined;

    const img = imgRef.current;
    const naturalW = img?.naturalWidth || overlayImgRef.current?.naturalWidth || 0;
    const naturalH = img?.naturalHeight || overlayImgRef.current?.naturalHeight || 0;
    if (!naturalW || !naturalH) return card.annotationData;

    const off = document.createElement('canvas');
    off.width = naturalW;
    off.height = naturalH;
    const ctx = off.getContext('2d');
    if (!ctx) return card.annotationData;

    // Altes Overlay zuerst in voller Auflösung hineinzeichnen
    if (keepOverlay && overlayImgRef.current) {
      ctx.drawImage(overlayImgRef.current, 0, 0, naturalW, naturalH);
    }

    // Neue Striche von Display- auf Naturauflösung hochskalieren
    const displayW = displaySizeRef.current.w;
    const scale = displayW > 0 ? naturalW / displayW : 1;
    for (const s of strokesRef.current) {
      const scaledPoints = s.points.map((p) => ({ x: p.x * scale, y: p.y * scale }));
      paintStroke(ctx, scaledPoints, s.color, s.width * scale);
    }

    return off.toDataURL('image/png');
  };

  const handleSizeChange = async (size: CardSize) => {
    await changeSize(card.id, size);
  };

  const handleColorChange = async (frameColor: string) => {
    await updateCard(card.id, { frameColor });
  };

  const handleSave = async () => {
    const annotationData = buildAnnotationData();
    await updateCard(card.id, { label: label || undefined, annotationData });
    closeModal();
  };

  const handleDelete = async () => {
    await deleteCard(card.id);
    showToast(t('Foto gelöscht'));
    closeModal();
  };

  const handleRemoveFromStack = async () => {
    await removeFromStack(card.id);
    showToast(t('Aus Stapel entfernt'));
  };

  return (
    <Modal
      isOpen={true}
      onClose={closeModal}
      onSave={handleSave}
      title={t('Foto')}
      closeOnBackdrop={false}
    >
      <div className="space-y-4">
        {/* Label */}
        <div>
          <label htmlFor="photo-label" className="block text-sm font-medium text-gray-700 mb-1">
            {t('Bezeichnung')}
          </label>
          <input
            id="photo-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('z.B. Foto 1')}
            className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-pastel-blue"
          />
        </div>

        {/* Photo preview / annotation */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">
              {t('Inhalt')}
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => { setCropMode((v) => !v); setDrawMode(false); }}
                className={`text-sm font-semibold transition-colors ${
                  cropMode ? 'text-primary-blue' : 'text-ink-soft hover:text-ink'
                }`}
              >
                {t('Zuschneiden')}
              </button>
              <button
                type="button"
                onClick={() => { setDrawMode((v) => !v); setCropMode(false); }}
                className={`text-sm font-semibold transition-colors ${
                  drawMode ? 'text-primary-blue' : 'text-ink-soft hover:text-ink'
                }`}
              >
                {drawMode ? t('Fertig') : t('Zeichnen')}
              </button>
            </div>
          </div>

          {cropMode ? (
            <ImageCropView
              imageData={liveImageData}
              maxHeight={256}
              onCancel={() => setCropMode(false)}
              onApply={async ({ imageData, thumbnailData, cropWidth, cropHeight }) => {
                // Anmerkungen passen nach dem Zuschnitt nicht mehr auf das Bild
                const changes: Partial<PhotoCard> = {
                  imageData,
                  thumbnailData,
                  annotationData: undefined,
                };
                // Im freien Modus schrumpft die Karte anteilig mit dem Ausschnitt –
                // der Bildmaßstab bleibt gleich, genau wie beim Zuschneiden im Buch.
                if (card.freeSize) {
                  changes.freeSize = {
                    width: clampCardEdge(card.freeSize.width * cropWidth),
                    height: clampCardEdge(card.freeSize.height * cropHeight),
                  };
                }
                await updateCard(card.id, changes);
                showToast(t('Bild zugeschnitten'));
                setCropMode(false);
              }}
            />
          ) : drawMode ? (
            <div className="relative rounded-2xl overflow-hidden bg-gray-100 select-none">
              <img
                ref={imgRef}
                src={liveImageData}
                alt=""
                draggable={false}
                onLoad={syncCanvasSize}
                className="block w-full h-auto"
              />
              <canvas
                ref={canvasRef}
                className="absolute top-0 left-0"
                style={{ touchAction: 'none' }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              />
            </div>
          ) : (
            <div className="relative rounded-2xl overflow-hidden bg-gray-100">
              <img
                ref={imgRef}
                src={liveImageData}
                alt={card.label || t('Foto')}
                className="w-full h-auto max-h-64 object-contain"
              />
              {overlayLoaded && !overlayRemoved && card.annotationData && (
                <img
                  src={card.annotationData}
                  alt=""
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                />
              )}
            </div>
          )}

          {/* Zeichen-Werkzeuge */}
          {drawMode && (
            <div className="mt-3 space-y-3">
              {/* Farben */}
              <div className="flex flex-wrap gap-2">
                {DRAWING_COLORS.map((c) => (
                  <button
                    key={c.color}
                    type="button"
                    onClick={() => setColor(c.color)}
                    className={`w-8 h-8 rounded-full border-2 transition-transform ${
                      color === c.color ? 'border-ink scale-110' : 'border-gray-200'
                    }`}
                    style={{ backgroundColor: c.color }}
                    aria-label={t(c.name)}
                  />
                ))}
              </div>

              {/* Strichstärke + Aktionen */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {STROKE_WIDTHS.map((w, i) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setWidthIndex(i)}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                        widthIndex === i ? 'bg-primary-blue/15' : 'bg-gray-100 hover:bg-gray-200'
                      }`}
                      aria-label={t('Strichstärke {w}', { w })}
                    >
                      <span
                        className="rounded-full bg-ink block"
                        style={{ width: w + 2, height: w + 2 }}
                      />
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={strokeCount === 0}
                    className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-ink hover:bg-gray-200 disabled:opacity-40 disabled:hover:bg-gray-100 transition-colors"
                  >
                    {t('Rückgängig')}
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-ink hover:bg-gray-200 transition-colors"
                  >
                    {t('Alles löschen')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Anmerkungen entfernen (nur wenn Annotation existiert, außerhalb des Zeichenmodus) */}
          {hasAnnotation && !drawMode && (
            <button
              type="button"
              onClick={handleRemoveAnnotations}
              className="mt-2 text-red-500 hover:text-red-700 text-sm font-medium transition-colors"
            >
              {t('Anmerkungen entfernen')}
            </button>
          )}
        </div>

        {/* Size options */}
        {!isFreeLayout && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('Größe')}
            </label>
            <div className="flex gap-2">
              {(Object.entries(CARD_SIZES) as [CardSize, typeof CARD_SIZES.small][]).map(
                ([size, config]) => (
                  <button
                    key={size}
                    onClick={() => handleSizeChange(size)}
                    className={`flex-1 py-2 px-3 rounded-xl font-medium transition-colors text-sm ${
                      card.size === size
                        ? 'bg-pastel-blue text-gray-800'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {t(config.label)}
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {/* Color options */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('Rahmenfarbe')}
          </label>
          <div className="flex flex-wrap gap-2">
            {['#FFFFFF', ...FRAME_COLORS].map((frameColor) => (
              <button
                key={frameColor}
                onClick={() => handleColorChange(frameColor)}
                className={`w-9 h-9 rounded-full border-2 transition-transform ${
                  card.frameColor === frameColor || (!card.frameColor && frameColor === '#FFFFFF')
                    ? 'border-gray-800 scale-110'
                    : 'border-gray-200'
                }`}
                style={{ backgroundColor: frameColor }}
                aria-label={t('Farbe {frameColor}', { frameColor })}
              />
            ))}
          </div>
        </div>

        {/* Stack options */}
        {card.stackId && (
          <button
            onClick={handleRemoveFromStack}
            className="w-full py-2 px-4 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium transition-colors text-sm"
          >
            {t('Aus Stapel entfernen')}
          </button>
        )}

        {/* Delete link */}
        <div className="pt-2 border-t border-gray-100">
          <button
            onClick={handleDelete}
            className="text-red-500 hover:text-red-700 text-sm font-medium transition-colors"
          >
            {t('Karte löschen')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
