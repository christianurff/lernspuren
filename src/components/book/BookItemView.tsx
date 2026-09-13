import { memo, useRef } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { BookItem } from '../../types';
import { BOOK_FONT_FAMILIES } from '../../types';
import { useBookStore } from '../../stores/useBookStore';
import {
  MIN_ITEM_SIZE,
  angleFromCenter,
  clampToPage,
  resizeFromCorner,
  snapRotation,
  snapToCenter,
} from '../../utils/bookGeometry';
import type { Corner, Rect } from '../../utils/bookGeometry';
import { TextItemEditor } from './TextItemEditor';
import type { BookItemViewProps } from './types';
import { useT } from '../../i18n';

const SELECTION_COLOR = '#5B8DEF';
const TAP_TOLERANCE = 4; // Bewegung in Bildschirmpixeln, bis aus dem Tippen ein Ziehen wird
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];

interface Gesture {
  kind: 'drag' | 'resize' | 'rotate';
  pointerId: number;
  startX: number; // Bildschirmkoordinaten
  startY: number;
  before: Rect & { rotation: number };
  corner: Corner;
  center: { x: number; y: number }; // Mittelpunkt des Items in Bildschirmkoordinaten
  startAngle: number;
  moved: boolean;
  aufPlay: boolean; // Geste begann auf dem Play-Knopf (Video) bzw. Lautsprecher (Audio)
}

function rectOf(item: BookItem): Rect & { rotation: number } {
  return { x: item.x, y: item.y, width: item.width, height: item.height, rotation: item.rotation };
}

// Bild/Video/Zeichnung/Audio behalten beim Skalieren ihr Seitenverhältnis, Text nicht
function keepsAspect(item: BookItem): boolean {
  return item.type !== 'text';
}

function elementCenter(el: HTMLElement): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function BookItemViewInner({
  item,
  mode,
  scale,
  pageWidth,
  pageHeight,
  zIndex,
  isSelected,
  isEditing,
  onItemActivate,
  onSnapChange,
}: BookItemViewProps) {
  const t = useT();
  const selectItem = useBookStore((s) => s.selectItem);
  const setEditingItem = useBookStore((s) => s.setEditingItem);
  const updateItemLocal = useBookStore((s) => s.updateItemLocal);
  const updateItem = useBookStore((s) => s.updateItem);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<Gesture | null>(null);

  // Griffe sollen auf dem Bildschirm immer gleich groß sein, egal wie stark die Seite skaliert ist
  const px = (value: number) => value / (scale || 1);
  const interactive = mode === 'edit' && !isEditing;

  // --- Gesten ---------------------------------------------------------------

  const startGesture = (
    e: ReactPointerEvent<HTMLElement>,
    kind: Gesture['kind'],
    corner: Corner = 'se',
    aufPlay = false
  ) => {
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture?.(e.pointerId);
    const wrapper = wrapperRef.current;
    const center = wrapper ? elementCenter(wrapper) : { x: e.clientX, y: e.clientY };
    gestureRef.current = {
      kind,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      before: rectOf(item),
      corner,
      center,
      startAngle: angleFromCenter(center, { x: e.clientX, y: e.clientY }),
      moved: false,
      aufPlay,
    };
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (mode === 'static' || isEditing) return;
    // Tippen auf den Play-Knopf startet die Wiedergabe, Ziehen von dort
    // verschiebt das Element trotzdem – entschieden wird erst beim Loslassen.
    const aufPlay = !!(e.target as Element | null)?.closest?.('[data-book-play]');
    startGesture(e, 'drag', 'se', aufPlay);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    const screenDx = e.clientX - gesture.startX;
    const screenDy = e.clientY - gesture.startY;
    if (!gesture.moved && Math.hypot(screenDx, screenDy) > TAP_TOLERANCE) {
      gesture.moved = true;
    }
    if (!gesture.moved || mode !== 'edit') return;

    const dx = screenDx / (scale || 1);
    const dy = screenDy / (scale || 1);

    if (gesture.kind === 'drag') {
      const moved: Rect = {
        x: gesture.before.x + dx,
        y: gesture.before.y + dy,
        width: gesture.before.width,
        height: gesture.before.height,
      };
      const snapped = snapToCenter(moved, pageWidth, pageHeight);
      const clamped = clampToPage(snapped.rect, pageWidth, pageHeight);
      updateItemLocal(item.id, { x: clamped.x, y: clamped.y });
      onSnapChange?.({ snapX: snapped.snapX, snapY: snapped.snapY });
      return;
    }

    if (gesture.kind === 'resize') {
      // Ziehen in die gedrehte Lage des Items umrechnen
      const rad = (-gesture.before.rotation * Math.PI) / 180;
      const localDx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const localDy = dx * Math.sin(rad) + dy * Math.cos(rad);
      const resized = resizeFromCorner(
        gesture.before,
        gesture.corner,
        localDx,
        localDy,
        keepsAspect(item),
        gesture.before.rotation
      );
      updateItemLocal(item.id, resized);
      return;
    }

    const angle = angleFromCenter(gesture.center, { x: e.clientX, y: e.clientY });
    const rotation = snapRotation(gesture.before.rotation + (angle - gesture.startAngle));
    updateItemLocal(item.id, { rotation });
  };

  const finishGesture = (e: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    gestureRef.current = null;
    onSnapChange?.({ snapX: false, snapY: false });

    if (!gesture.moved) {
      if (mode === 'read') {
        onItemActivate?.(item);
      } else if (mode === 'edit') {
        if (gesture.aufPlay && (item.type === 'video' || item.type === 'audio')) onItemActivate?.(item);
        else if (!isSelected) selectItem(item.id);
        else if (item.type === 'text') setEditingItem(item.id);
      }
      return;
    }
    if (mode !== 'edit') return;

    const current = useBookStore.getState().items.find((it) => it.id === item.id);
    if (!current) return;
    const before = gesture.before;

    if (gesture.kind === 'drag') {
      void updateItem(item.id, { x: current.x, y: current.y }, { x: before.x, y: before.y });
      return;
    }
    if (gesture.kind === 'resize') {
      // Text bekommt nach dem Skalieren die zum Inhalt passende Höhe
      const contentHeight = current.type === 'text' && textRef.current ? textRef.current.scrollHeight : null;
      const height = contentHeight ? Math.max(MIN_ITEM_SIZE, Math.round(contentHeight)) : current.height;
      void updateItem(
        item.id,
        { x: current.x, y: current.y, width: current.width, height },
        { x: before.x, y: before.y, width: before.width, height: before.height }
      );
      return;
    }
    void updateItem(item.id, { rotation: current.rotation }, { rotation: before.rotation });
  };

  const handlePointerCancel = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!gestureRef.current) return;
    gestureRef.current = null;
    onSnapChange?.({ snapX: false, snapY: false });
    e.stopPropagation();
  };

  // --- Inhalt ---------------------------------------------------------------

  let content: ReactNode = null;

  if (item.type === 'image') {
    // In Miniaturen (Seitenübersicht) reicht das Vorschaubild – spart Speicher und Renderzeit
    content = (
      <img
        src={(mode === 'static' ? item.thumbnailData : undefined) ?? item.imageData}
        alt=""
        draggable={false}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          borderRadius: item.borderRadius ?? 0,
          border: item.borderColor ? `6px solid ${item.borderColor}` : undefined,
          pointerEvents: 'none',
        }}
      />
    );
  } else if (item.type === 'drawing') {
    content = (
      <img
        src={item.imageData}
        alt=""
        draggable={false}
        style={{ display: 'block', width: '100%', height: '100%', objectFit: 'fill', pointerEvents: 'none' }}
      />
    );
  } else if (item.type === 'video') {
    content = (
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          borderRadius: 12,
          overflow: 'hidden',
          backgroundColor: '#374151',
        }}
      >
        {item.thumbnailData && (
          <img
            src={item.thumbnailData}
            alt=""
            draggable={false}
            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
          />
        )}
        <div
          data-book-play=""
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 88,
            height: 88,
            borderRadius: '50%',
            backgroundColor: 'rgba(255,255,255,0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            // Im Editor ist der Kreis der Auslöser für die Wiedergabe; sonst
            // reicht das Antippen des ganzen Videos.
            pointerEvents: mode === 'edit' ? 'auto' : 'none',
            cursor: mode === 'edit' ? 'pointer' : undefined,
          }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="#1E3A5F" aria-hidden="true">
            <path d="M8 5.5v13l11-6.5-11-6.5z" />
          </svg>
        </div>
      </div>
    );
  } else if (item.type === 'audio') {
    content = (
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 20,
          backgroundColor: '#EEF2FF',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: 12,
          pointerEvents: 'none',
        }}
      >
        {/* Im Editor ist der Lautsprecher der Auslöser fürs Anhören (wie der
            Play-Kreis auf dem Video); der weiße Kreis zeigt, dass man ihn
            antippen kann. Im Lesemodus genügt ein Tipp auf die ganze Karte. */}
        <div
          data-book-play={mode === 'edit' ? '' : undefined}
          style={{
            width: 84,
            height: 84,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: mode === 'edit' ? 'rgba(255,255,255,0.92)' : undefined,
            pointerEvents: mode === 'edit' ? 'auto' : 'none',
            cursor: mode === 'edit' ? 'pointer' : undefined,
            flexShrink: 0,
          }}
        >
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#5B8DEF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M11 5 6 9H3v6h3l5 4V5z" fill="#5B8DEF" stroke="#5B8DEF" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M18.5 5.5a9 9 0 0 1 0 13" />
          </svg>
        </div>
        {item.label && (
          <span
            style={{
              fontSize: 20,
              color: '#1E3A5F',
              textAlign: 'center',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
            }}
          >
            {item.label}
          </span>
        )}
      </div>
    );
  } else {
    const isEmpty = item.text.trim().length === 0;
    const showPlaceholder = isEmpty && mode === 'edit' && !isEditing;
    content = (
      <div
        ref={textRef}
        style={{
          width: '100%',
          height: '100%',
          padding: 12,
          font: `${item.bold ? 'bold ' : ''}${item.fontSize}px ${BOOK_FONT_FAMILIES[item.fontFamily].css}`,
          lineHeight: 1.25,
          color: showPlaceholder ? '#6B7C93' : item.color,
          textAlign: item.align,
          backgroundColor: item.backgroundColor,
          borderRadius: item.backgroundColor ? 12 : undefined,
          border: showPlaceholder ? '2px dashed #6B7C93' : undefined,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflow: 'hidden',
          visibility: isEditing ? 'hidden' : 'visible',
          pointerEvents: 'none',
        }}
      >
        {showPlaceholder ? t('Tippe, um zu schreiben') : item.text}
      </div>
    );
  }

  // --- Auswahl-Griffe -------------------------------------------------------

  const handleDot: CSSProperties = {
    width: px(28),
    height: px(28),
    borderRadius: '50%',
    backgroundColor: '#FFFFFF',
    border: `${px(2.5)}px solid ${SELECTION_COLOR}`,
    boxShadow: '0 1px 3px rgba(30,58,95,0.25)',
  };

  const handleBox = (left: number, top: number): CSSProperties => ({
    position: 'absolute',
    left,
    top,
    width: px(44),
    height: px(44),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    touchAction: 'none',
  });

  const style: CSSProperties = {
    position: 'absolute',
    left: item.x,
    top: item.y,
    width: item.width,
    height: item.height,
    transform: `rotate(${item.rotation}deg)`,
    transformOrigin: 'center center',
    zIndex,
    touchAction: mode === 'static' ? undefined : 'none',
    // Seitenfüllende Zeichnungen dürfen die Elemente darunter nicht blockieren
    pointerEvents: mode === 'static' || item.type === 'drawing' ? 'none' : 'auto',
    cursor: mode === 'edit' ? 'move' : mode === 'read' ? 'pointer' : 'default',
  };

  return (
    <div
      ref={wrapperRef}
      data-book-item={item.id}
      style={style}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishGesture}
      onPointerCancel={handlePointerCancel}
    >
      {content}

      {isEditing && item.type === 'text' && <TextItemEditor item={item} />}

      {mode === 'edit' && isSelected && (
        <div
          style={{
            position: 'absolute',
            inset: -px(2.5),
            border: `${px(2.5)}px solid ${SELECTION_COLOR}`,
            borderRadius: px(6),
            pointerEvents: 'none',
          }}
        />
      )}

      {interactive && isSelected && (
        <>
          {CORNERS.map((corner) => {
            const left = (corner === 'nw' || corner === 'sw' ? 0 : item.width) - px(22);
            const top = (corner === 'nw' || corner === 'ne' ? 0 : item.height) - px(22);
            return (
              <div
                key={corner}
                role="presentation"
                aria-label={t('Größe ändern')}
                style={{
                  ...handleBox(left, top),
                  cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize',
                }}
                onPointerDown={(e) => startGesture(e, 'resize', corner)}
              >
                <div style={handleDot} />
              </div>
            );
          })}

          <div
            role="presentation"
            aria-label={t('Drehen')}
            style={{ ...handleBox(item.width / 2 - px(22), -px(36) - px(22)), cursor: 'grab' }}
            onPointerDown={(e) => startGesture(e, 'rotate')}
          >
            <div
              style={{
                ...handleDot,
                width: px(36),
                height: px(36),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg
                width={px(20)}
                height={px(20)}
                viewBox="0 0 24 24"
                fill="none"
                stroke={SELECTION_COLOR}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 12a8 8 0 1 1-2.34-5.66" />
                <path d="M20 3v5h-5" />
              </svg>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Seitenübersicht und Präsentation rendern viele Items gleichzeitig: Neu-Rendern
// nur, wenn sich die Props dieses Items wirklich ändern.
export const BookItemView = memo(BookItemViewInner);
