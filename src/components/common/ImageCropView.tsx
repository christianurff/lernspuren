import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Button } from './Button';
import { useUIStore } from '../../stores';
import { createThumbnail } from '../../utils/imageCompression';
import { useT } from '../../i18n';

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'move';

const MIN_CROP = 0.08; // Mindestgröße relativ zum Bild
const HANDLE_SIZE = 32;

export interface ImageCropResult {
  imageData: string;
  thumbnailData?: string;
  /** Anteil (0–1) der behaltenen Breite bzw. Höhe – für die Größe des Ziels */
  cropWidth: number;
  cropHeight: number;
}

interface ImageCropViewProps {
  imageData: string;
  onCancel: () => void;
  onApply: (result: ImageCropResult) => Promise<void> | void;
  /** Höchste Anzeigehöhe des Bildes; ohne Angabe so hoch wie das Fenster erlaubt */
  maxHeight?: number;
}

/**
 * Zuschneiden eines Bildes: Rechteck mit vier Eckgriffen über dem Bild. Die
 * Komponente kennt weder Buch noch Whiteboard – sie liefert das zugeschnittene
 * Bild samt Anteil des behaltenen Ausschnitts an den Aufrufer zurück, der
 * daraus die neue Größe seines Elements ableitet.
 */
export function ImageCropView({ imageData, onCancel, onApply, maxHeight }: ImageCropViewProps) {
  const t = useT();
  const showToast = useUIStore((s) => s.showToast);

  const frameRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  // Verfügbare Breite kommt aus dem umgebenden Kasten, nicht aus dem Fenster:
  // die Ansicht steckt mal im breiten Buch-Modal, mal im schmalen Foto-Editor.
  const [boxWidth, setBoxWidth] = useState(0);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [display, setDisplay] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  // Ausschnitt relativ zum Bild (0–1)
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, width: 1, height: 1 });
  const [isSaving, setIsSaving] = useState(false);
  const dragRef = useRef<{ handle: Handle; startX: number; startY: number; start: CropRect } | null>(null);

  // Bild laden und Anzeigegröße an das Fenster anpassen
  useEffect(() => {
    if (!imageData) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setNatural({ width: img.naturalWidth, height: img.naturalHeight });
      setCrop({ x: 0, y: 0, width: 1, height: 1 });
    };
    img.src = imageData;
    return () => {
      cancelled = true;
    };
  }, [imageData]);

  // Breite des Kastens verfolgen (Fenstergröße allein reicht nicht)
  useEffect(() => {
    const element = boxRef.current;
    if (!element) return;
    const update = () => setBoxWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!natural || boxWidth === 0) return;
    const update = () => {
      const availableWidth = Math.max(120, boxWidth - HANDLE_SIZE);
      const availableHeight = maxHeight ?? Math.max(200, window.innerHeight - 260);
      const scale = Math.min(availableWidth / natural.width, availableHeight / natural.height, 1.5);
      setDisplay({ width: Math.round(natural.width * scale), height: Math.round(natural.height * scale) });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [natural, boxWidth, maxHeight]);

  if (!imageData) return null;

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const handlePointerDown = (handle: Handle) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { handle, startX: e.clientX, startY: e.clientY, start: crop };
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || display.width === 0) return;
    const dx = (e.clientX - drag.startX) / display.width;
    const dy = (e.clientY - drag.startY) / display.height;
    const { start } = drag;
    let next: CropRect;
    if (drag.handle === 'move') {
      next = {
        ...start,
        x: clamp(start.x + dx, 0, 1 - start.width),
        y: clamp(start.y + dy, 0, 1 - start.height),
      };
    } else {
      const left = drag.handle === 'nw' || drag.handle === 'sw';
      const top = drag.handle === 'nw' || drag.handle === 'ne';
      const right = start.x + start.width;
      const bottom = start.y + start.height;
      const x1 = left ? clamp(start.x + dx, 0, right - MIN_CROP) : start.x;
      const x2 = left ? right : clamp(right + dx, start.x + MIN_CROP, 1);
      const y1 = top ? clamp(start.y + dy, 0, bottom - MIN_CROP) : start.y;
      const y2 = top ? bottom : clamp(bottom + dy, start.y + MIN_CROP, 1);
      next = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
    }
    setCrop(next);
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const handleApply = async () => {
    if (!natural) return;
    const isWhole = crop.x === 0 && crop.y === 0 && crop.width === 1 && crop.height === 1;
    if (isWhole) {
      onCancel();
      return;
    }
    setIsSaving(true);
    try {
      const sx = Math.round(crop.x * natural.width);
      const sy = Math.round(crop.y * natural.height);
      const sw = Math.max(1, Math.round(crop.width * natural.width));
      const sh = Math.max(1, Math.round(crop.height * natural.height));
      const source = new Image();
      await new Promise<void>((resolve, reject) => {
        source.onload = () => resolve();
        source.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
        source.src = imageData;
      });
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas nicht verfügbar');
      ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
      // PNG behält Transparenz (z. B. Zeichnungen), sonst JPEG wie bei der Kompression
      const isPng = imageData.startsWith('data:image/png');
      const cropped = isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9);
      let thumbnailData: string | undefined;
      try {
        thumbnailData = await createThumbnail(cropped);
      } catch {
        thumbnailData = undefined;
      }
      await onApply({
        imageData: cropped,
        thumbnailData,
        cropWidth: crop.width,
        cropHeight: crop.height,
      });
    } catch (error) {
      console.error('Zuschneiden fehlgeschlagen:', error);
      showToast(t('Zuschneiden fehlgeschlagen'));
    } finally {
      setIsSaving(false);
    }
  };

  const px = (value: number, size: number) => Math.round(value * size);
  const rectStyle = {
    left: px(crop.x, display.width),
    top: px(crop.y, display.height),
    width: px(crop.width, display.width),
    height: px(crop.height, display.height),
  };

  const handleStyle = (handle: Exclude<Handle, 'move'>) => ({
    position: 'absolute' as const,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    left: handle === 'nw' || handle === 'sw' ? -HANDLE_SIZE / 2 : undefined,
    right: handle === 'ne' || handle === 'se' ? -HANDLE_SIZE / 2 : undefined,
    top: handle === 'nw' || handle === 'ne' ? -HANDLE_SIZE / 2 : undefined,
    bottom: handle === 'sw' || handle === 'se' ? -HANDLE_SIZE / 2 : undefined,
    touchAction: 'none' as const,
    cursor: handle === 'nw' || handle === 'se' ? 'nwse-resize' : 'nesw-resize',
  });

  return (
    <div ref={boxRef}>
      <p className="text-sm text-ink-soft mb-3">{t('Ziehe an den Ecken oder verschiebe den hellen Bereich.')}</p>
      {/* Innenabstand, damit die Eckgriffe nicht abgeschnitten werden */}
      <div className="flex justify-center" style={{ padding: HANDLE_SIZE / 2 }}>
        <div
          ref={frameRef}
          className="relative select-none rounded-xl overflow-visible bg-black/5"
          style={{ width: display.width, height: display.height, touchAction: 'none' }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {display.width > 0 && (
            <img
              src={imageData}
              alt=""
              draggable={false}
              className="block rounded-xl"
              style={{ width: display.width, height: display.height, pointerEvents: 'none' }}
            />
          )}
          {/* Abdunkelung außerhalb des Ausschnitts */}
          <div
            className="absolute inset-0 rounded-xl pointer-events-none"
            style={{
              background: 'rgba(0,0,0,0.5)',
              clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${rectStyle.left}px ${rectStyle.top}px, ${rectStyle.left}px ${
                rectStyle.top + rectStyle.height
              }px, ${rectStyle.left + rectStyle.width}px ${rectStyle.top + rectStyle.height}px, ${
                rectStyle.left + rectStyle.width
              }px ${rectStyle.top}px, ${rectStyle.left}px ${rectStyle.top}px)`,
            }}
          />
          {/* Ausschnitt */}
          <div
            className="absolute border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
            style={{ ...rectStyle, cursor: 'move', touchAction: 'none' }}
            onPointerDown={handlePointerDown('move')}
            role="presentation"
          >
            {(['nw', 'ne', 'sw', 'se'] as const).map((handle) => (
              <div
                key={handle}
                style={handleStyle(handle)}
                onPointerDown={handlePointerDown(handle)}
                className="flex items-center justify-center"
                role="presentation"
              >
                <div className="w-5 h-5 rounded-full bg-white border-2 border-primary-blue shadow" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={onCancel} disabled={isSaving}>
          {t('Abbrechen')}
        </Button>
        <Button onClick={() => void handleApply()} disabled={isSaving || !natural}>
          {isSaving ? t('Wird verarbeitet …') : t('Zuschneiden')}
        </Button>
      </div>
    </div>
  );
}
