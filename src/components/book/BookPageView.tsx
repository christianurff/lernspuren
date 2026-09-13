import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { BookItem, BookPagePattern } from '../../types';
import { useBookStore } from '../../stores/useBookStore';
import { BookInlineAudio } from './BookInlineAudio';
import { BookInlineVideo } from './BookInlineVideo';
import { BookItemView } from './BookItemView';
import { ItemActionBar } from './ItemActionBar';
import type { BookPageViewProps, BookSnapState } from './types';

const PATTERN_STEP = 48; // Abstand der Linien/Punkte in Seitenpunkten
const PATTERN_COLOR = 'rgba(30,58,95,0.12)';
const SELECTION_COLOR = '#5B8DEF';

function patternStyle(pattern: BookPagePattern | undefined, scale: number): CSSProperties {
  const step = PATTERN_STEP * scale;
  if (!pattern || pattern === 'none' || step <= 0) return {};
  if (pattern === 'lines') {
    return {
      backgroundImage: `linear-gradient(to bottom, ${PATTERN_COLOR} 1px, transparent 1px)`,
      backgroundSize: `100% ${step}px`,
    };
  }
  if (pattern === 'grid') {
    return {
      backgroundImage: `linear-gradient(to bottom, ${PATTERN_COLOR} 1px, transparent 1px), linear-gradient(to right, ${PATTERN_COLOR} 1px, transparent 1px)`,
      backgroundSize: `${step}px ${step}px`,
    };
  }
  return {
    backgroundImage: `radial-gradient(${PATTERN_COLOR} 2px, transparent 2px)`,
    backgroundSize: `${step}px ${step}px`,
  };
}

/**
 * Eine Buchseite: Hintergrund, Muster und Elemente in Seitenkoordinaten.
 * `edit` = interaktiv, `read` = nur antippen, `static` = reine Darstellung (Miniaturen).
 */
export function BookPageView({
  page,
  items,
  pageWidth,
  pageHeight,
  scale,
  mode,
  onItemActivate,
  className = '',
}: BookPageViewProps) {
  const selectedItemId = useBookStore((s) => s.selectedItemId);
  const editingItemId = useBookStore((s) => s.editingItemId);
  const selectItem = useBookStore((s) => s.selectItem);
  const setEditingItem = useBookStore((s) => s.setEditingItem);

  const [snap, setSnap] = useState<BookSnapState>({ snapX: false, snapY: false });
  const handleSnapChange = useCallback((next: BookSnapState) => {
    setSnap((prev) => (prev.snapX === next.snapX && prev.snapY === next.snapY ? prev : next));
  }, []);

  const isEdit = mode === 'edit';
  const selectedItem = isEdit ? items.find((it) => it.id === selectedItemId) : undefined;

  // Video und Sprachaufnahme im Editor an ihrem Platz abspielen
  // (Play-Knopf auf dem Video, Lautsprecher auf der Aufnahme)
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [shownPageId, setShownPageId] = useState(page.id);
  if (shownPageId !== page.id) {
    setShownPageId(page.id);
    setPlayingId(null); // beim Blättern nicht weiterlaufen lassen
  }
  const playingItem = isEdit ? items.find((it) => it.id === playingId) : undefined;
  const playingVideo = playingItem?.type === 'video' ? playingItem : undefined;
  const playingAudio = playingItem?.type === 'audio' ? playingItem : undefined;

  // Tipp irgendwo daneben beendet die Wiedergabe – auch auf der Werkzeugleiste
  // oder einem anderen Element. Der Zeiger wird in der Capture-Phase gelesen,
  // weil die Player-Leisten das Weiterreichen sonst unterbinden.
  useEffect(() => {
    if (!playingId) return;
    const stopIfOutside = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (target?.closest?.('[data-book-inline-media]')) return;
      setPlayingId(null);
    };
    document.addEventListener('pointerdown', stopIfOutside, true);
    return () => document.removeEventListener('pointerdown', stopIfOutside, true);
  }, [playingId]);

  const handleItemActivate = (item: BookItem) => {
    if (!isEdit) {
      onItemActivate?.(item);
      return;
    }
    if (item.type === 'video' || item.type === 'audio') {
      setPlayingId((prev) => (prev === item.id ? null : item.id));
    }
  };

  // Tippen auf freie Seitenfläche hebt die Auswahl auf
  const handleBackgroundPointerDown = () => {
    if (!isEdit) return;
    selectItem(null);
    setEditingItem(null);
  };

  const guideStyle: CSSProperties = {
    position: 'absolute',
    borderColor: SELECTION_COLOR,
    borderStyle: 'dashed',
    pointerEvents: 'none',
  };

  return (
    <div className={`relative ${className}`} style={{ width: pageWidth * scale, height: pageHeight * scale }}>
      <div
        onPointerDown={handleBackgroundPointerDown}
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 12,
          overflow: 'hidden',
          backgroundColor: page.backgroundColor,
          ...patternStyle(page.backgroundPattern, scale),
        }}
      >
        <div
          data-book-page-content=""
          style={{
            width: pageWidth,
            height: pageHeight,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            position: 'relative',
          }}
        >
          {items.map((item, index) => (
            <BookItemView
              key={item.id}
              item={item}
              mode={mode}
              scale={scale}
              pageWidth={pageWidth}
              pageHeight={pageHeight}
              zIndex={index + 1}
              isSelected={isEdit && item.id === selectedItemId}
              isEditing={isEdit && item.id === editingItemId}
              onItemActivate={handleItemActivate}
              onSnapChange={handleSnapChange}
            />
          ))}
        </div>

        {isEdit && snap.snapX && (
          <div style={{ ...guideStyle, left: '50%', top: 0, bottom: 0, borderLeftWidth: 2 }} />
        )}
        {isEdit && snap.snapY && (
          <div style={{ ...guideStyle, top: '50%', left: 0, right: 0, borderTopWidth: 2 }} />
        )}
      </div>

      {playingVideo && (
        <BookInlineVideo item={playingVideo} scale={scale} onClose={() => setPlayingId(null)} />
      )}

      {playingAudio && (
        <BookInlineAudio
          item={playingAudio}
          scale={scale}
          pageWidth={pageWidth}
          pageHeight={pageHeight}
          onClose={() => setPlayingId(null)}
        />
      )}

      {selectedItem && editingItemId !== selectedItem.id && selectedItem.id !== playingId && (
        <ItemActionBar item={selectedItem} scale={scale} pageWidth={pageWidth} pageHeight={pageHeight} />
      )}
    </div>
  );
}
