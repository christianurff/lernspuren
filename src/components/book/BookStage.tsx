import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useBookStore } from '../../stores/useBookStore';
import { useBookUIStore } from '../../stores/useBookUIStore';
import { createDrawingItem } from '../../services/bookItemFactory';
import { fitPageScale } from '../../utils/bookGeometry';
import { IconButton } from '../common/IconButton';
import { BookPageView } from './BookPageView';
import { PenOverlay } from './PenOverlay';
import type { BookStageProps, PenResult } from './types';
import { useT } from '../../i18n';

const STAGE_PADDING = 24;
const SWIPE_THRESHOLD = 60; // Bildschirmpixel
const MAX_DOTS = 12;

const pageAnimationCss = `
@keyframes bookPageInNext { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: none; } }
@keyframes bookPageInPrev { from { opacity: 0; transform: translateX(-28px); } to { opacity: 1; transform: none; } }
`;

/**
 * Die Bühne des Buch-Editors: skaliert die aktuelle Seite auf den verfügbaren Platz,
 * blättert per Pfeil-Buttons oder Wischgeste und zeigt bei Bedarf die Stift-Ebene.
 */
export function BookStage({ pageWidth, pageHeight }: BookStageProps) {
  const t = useT();
  const pages = useBookStore((s) => s.pages);
  const items = useBookStore((s) => s.items);
  const currentPageIndex = useBookStore((s) => s.currentPageIndex);
  const nextPage = useBookStore((s) => s.nextPage);
  const prevPage = useBookStore((s) => s.prevPage);
  const addPage = useBookStore((s) => s.addPage);
  const addItem = useBookStore((s) => s.addItem);
  const updateItem = useBookStore((s) => s.updateItem);

  const tool = useBookUIStore((s) => s.tool);
  const editingDrawingId = useBookUIStore((s) => s.editingDrawingId);
  const stopPen = useBookUIStore((s) => s.stopPen);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  // Verfügbaren Platz messen (ohne setState direkt im Effekt – der Observer meldet sich selbst)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setViewport({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const page = pages[currentPageIndex];
  const pageItems = useMemo(
    () => (page ? items.filter((it) => it.pageId === page.id).sort((a, b) => a.zIndex - b.zIndex) : []),
    [items, page]
  );

  const scale =
    viewport.width > 0 && viewport.height > 0
      ? fitPageScale(pageWidth, pageHeight, viewport.width, viewport.height, STAGE_PADDING)
      : 0;

  // Blätterrichtung für die Übergangsanimation (state-adjust während des Renders)
  const [shownIndex, setShownIndex] = useState(currentPageIndex);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  // Beim ersten Laden ohne Animation erscheinen, nur beim Blättern animieren
  const [animate, setAnimate] = useState(false);
  if (shownIndex !== currentPageIndex) {
    setDirection(currentPageIndex > shownIndex ? 'next' : 'prev');
    setShownIndex(currentPageIndex);
    setAnimate(true);
  }

  const isPen = tool === 'pen';
  const isFirst = currentPageIndex <= 0;
  const isLast = currentPageIndex >= pages.length - 1;

  // --- Wischgeste auf dem Bühnenhintergrund ---------------------------------

  const handleStagePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    swipeRef.current = isPen ? null : { x: e.clientX, y: e.clientY };
  };

  const handleStagePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start || isPen) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return;
    const { selectedItemId, editingItemId } = useBookStore.getState();
    if (selectedItemId || editingItemId) return;
    if (dx < 0) nextPage();
    else prevPage();
  };

  // --- Stift ----------------------------------------------------------------

  const drawingItem = useMemo(() => {
    if (!editingDrawingId) return undefined;
    const found = items.find((it) => it.id === editingDrawingId);
    return found && found.type === 'drawing' ? found : undefined;
  }, [editingDrawingId, items]);

  // Während des Nachzeichnens zeigt allein das Overlay den Zeichnungsstand.
  // Bliebe das bestehende PNG darunter sichtbar, wären Radierer, Rückgängig und
  // "Alles löschen" erst nach "Fertig" zu sehen.
  const visibleItems =
    isPen && editingDrawingId ? pageItems.filter((it) => it.id !== editingDrawingId) : pageItems;

  const handlePenDone = async (result: PenResult | null) => {
    if (result && page) {
      if (!result.imageData) {
        // Alle Striche gelöscht: bestehende Zeichnung entfernen
        if (editingDrawingId) await useBookStore.getState().deleteItem(editingDrawingId);
      } else if (editingDrawingId) {
        await updateItem(editingDrawingId, { imageData: result.imageData, drawingData: result.drawingData });
      } else {
        await addItem(
          createDrawingItem(page.id, { width: pageWidth, height: pageHeight }, result.imageData, result.drawingData)
        );
      }
    }
    stopPen();
  };

  // --- Seitenanzeige --------------------------------------------------------

  const dotCount = Math.min(MAX_DOTS, Math.max(pages.length, 1));
  const activeDot =
    pages.length <= MAX_DOTS
      ? currentPageIndex
      : Math.round((currentPageIndex / Math.max(1, pages.length - 1)) * (dotCount - 1));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <style>{pageAnimationCss}</style>

      <div
        ref={containerRef}
        className={`relative flex min-h-0 flex-1 items-center justify-center ${isPen ? 'pb-[150px]' : ''}`}
        onPointerDown={handleStagePointerDown}
        onPointerUp={handleStagePointerUp}
        onPointerCancel={() => {
          swipeRef.current = null;
        }}
      >
        {page && scale > 0 && (
          <div className="relative" style={{ width: pageWidth * scale, height: pageHeight * scale }}>
            <div
              key={page.id}
              className="rounded-xl shadow-[0_12px_40px_rgba(30,58,95,0.18)]"
              style={animate ? { animation: `bookPageIn${direction === 'next' ? 'Next' : 'Prev'} 200ms ease-out` } : undefined}
            >
              <BookPageView
                page={page}
                items={visibleItems}
                pageWidth={pageWidth}
                pageHeight={pageHeight}
                scale={scale}
                mode="edit"
              />
            </div>

            {isPen && (
              <PenOverlay
                pageWidth={pageWidth}
                pageHeight={pageHeight}
                scale={scale}
                initial={drawingItem}
                onDone={(result) => void handlePenDone(result)}
              />
            )}
          </div>
        )}

        {!isPen && (
          <>
            <div className="absolute left-3 top-1/2 -translate-y-1/2">
              <IconButton
                size="lg"
                label={t('Vorherige Seite')}
                disabled={isFirst}
                onClick={prevPage}
                className={isFirst ? 'opacity-35' : ''}
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m15 6-6 6 6 6" />
                </svg>
              </IconButton>
            </div>

            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {isLast ? (
                <IconButton size="lg" variant="primary" label={t('Neue Seite')} showLabel onClick={() => void addPage()}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                </IconButton>
              ) : (
                <IconButton size="lg" label={t('Nächste Seite')} onClick={nextPage}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </IconButton>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col items-center gap-1.5 pb-2 pt-1">
        <span className="text-xs font-medium text-ink-soft">
          {t('Seite {n} von {m}', {
            n: Math.min(currentPageIndex + 1, Math.max(pages.length, 1)),
            m: Math.max(pages.length, 1),
          })}
        </span>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: dotCount }, (_, index) => (
            <span
              key={index}
              className={`block rounded-full transition-all duration-200 ${
                index === activeDot ? 'h-2 w-2 bg-primary-blue' : 'h-1.5 w-1.5 bg-ink-soft/35'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
