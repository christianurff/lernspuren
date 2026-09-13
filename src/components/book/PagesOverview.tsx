import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useBookPageSize, useBookStore } from '../../stores/useBookStore';
import { useBookUIStore } from '../../stores/useBookUIStore';
import { IconButton } from '../common';
import { BookPageView } from './BookPageView';
import type { BookItem } from '../../types';
import { useT } from '../../i18n';

// Miniaturbreite: auf dem Tablet 160 px, auf schmalen Geräten 120 px
const THUMB_WIDE = 160;
const THUMB_NARROW = 120;
const WIDE_BREAKPOINT = 640;
// Wie lange gedrückt werden muss, bis eine Miniatur zum Ziehen "abhebt"
const LONG_PRESS_MS = 300;
// Ab dieser Bewegung gilt die Geste nicht mehr als Tippen/langes Drücken
const MOVE_TOLERANCE = 10;
// Randzone, in der die Übersicht beim Ziehen von selbst weiterrollt
const EDGE_ZONE = 72;
const MAX_SCROLL_SPEED = 16; // Pixel je Bild

function thumbWidthFor(width: number): number {
  return width >= WIDE_BREAKPOINT ? THUMB_WIDE : THUMB_NARROW;
}

interface DragState {
  from: number;
  to: number;
  dx: number;
  dy: number;
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function PagesOverview() {
  const t = useT();
  const panel = useBookUIStore((s) => s.panel);
  const closePanel = useBookUIStore((s) => s.closePanel);

  const pages = useBookStore((s) => s.pages);
  const items = useBookStore((s) => s.items);
  const currentPageIndex = useBookStore((s) => s.currentPageIndex);
  const setCurrentPage = useBookStore((s) => s.setCurrentPage);
  const addPage = useBookStore((s) => s.addPage);
  const duplicatePage = useBookStore((s) => s.duplicatePage);
  const deletePage = useBookStore((s) => s.deletePage);
  const movePage = useBookStore((s) => s.movePage);
  const { width: pageWidth, height: pageHeight } = useBookPageSize();

  const [thumbWidth, setThumbWidth] = useState(() =>
    typeof window === 'undefined' ? THUMB_WIDE : thumbWidthFor(window.innerWidth)
  );
  const [menuPageId, setMenuPageId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const tileRefs = useRef(new Map<number, HTMLDivElement>());
  const pressTimer = useRef<number | null>(null);
  const startPoint = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const autoScrollFrame = useRef<number | null>(null);
  const autoScrollSpeed = useRef(0);
  // Letzte Zeigerposition: Beim Auto-Rollen bewegt sich der Inhalt unter dem
  // ruhenden Finger, das Ziel muss trotzdem mitwandern.
  const lastPoint = useRef({ x: 0, y: 0 });

  const isOpen = panel === 'pages';

  // Items nach Seite gruppiert (bereits nach zIndex sortiert)
  const itemsByPage = useMemo(() => {
    const map = new Map<string, BookItem[]>();
    for (const item of items) {
      const list = map.get(item.pageId);
      if (list) list.push(item);
      else map.set(item.pageId, [item]);
    }
    for (const list of map.values()) list.sort((a, b) => a.zIndex - b.zIndex);
    return map;
  }, [items]);

  useEffect(() => {
    const handleResize = () => setThumbWidth(thumbWidthFor(window.innerWidth));
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Escape schließt die Übersicht
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, closePanel]);

  // Laufende Timer beim Verlassen aufräumen
  useEffect(() => {
    return () => {
      if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
      if (autoScrollFrame.current !== null) cancelAnimationFrame(autoScrollFrame.current);
    };
  }, []);

  // Während des Ziehens darf die Seite nicht mitscrollen: Safari deutet eine
  // senkrechte Bewegung sonst als Blättern und die Kachel bliebe liegen.
  // `touch-action` hilft hier nicht — der Wert steht schon beim Berühren fest.
  const isDraggingNow = drag !== null;
  useEffect(() => {
    if (!isDraggingNow) return;
    const block = (e: TouchEvent) => e.preventDefault();
    document.addEventListener('touchmove', block, { passive: false });
    return () => document.removeEventListener('touchmove', block);
  }, [isDraggingNow]);

  if (!isOpen) return null;

  const scale = thumbWidth / pageWidth;
  const thumbHeight = Math.round(pageHeight * scale);

  const cancelPress = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const closeMenu = () => {
    setMenuPageId(null);
    setConfirmDeleteId(null);
  };

  /**
   * Über welchem Platz liegt der Zeiger? Gemessen wird die *Ruhelage* der
   * Kacheln: Die angehobene Kachel klebt am Finger, ihre verschobene Mitte
   * wäre sonst immer die nächste — dann bliebe das Ziel ewig die Startseite.
   * (Das Skalieren beim Anheben ändert die Mitte nicht.)
   */
  const nearestIndex = (clientX: number, clientY: number, current: DragState): number => {
    let best = current.to;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const [index, el] of tileRefs.current) {
      if (index >= pages.length) continue;
      const rect = el.getBoundingClientRect();
      const lifted = index === current.from;
      const cx = rect.left + rect.width / 2 - (lifted ? current.dx : 0);
      const cy = rect.top + rect.height / 2 - (lifted ? current.dy : 0);
      const distance = (cx - clientX) ** 2 + (cy - clientY) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    return best;
  };

  // Nahe am oberen/unteren Rand rollt die Übersicht beim Ziehen weiter,
  // damit auch Seiten außerhalb des Bildschirms erreichbar bleiben.
  const stopAutoScroll = () => {
    autoScrollSpeed.current = 0;
    if (autoScrollFrame.current !== null) {
      cancelAnimationFrame(autoScrollFrame.current);
      autoScrollFrame.current = null;
    }
  };

  const updateAutoScroll = (clientY: number) => {
    const node = scrollRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    let speed = 0;
    if (clientY < rect.top + EDGE_ZONE) {
      speed = -Math.min(MAX_SCROLL_SPEED, (rect.top + EDGE_ZONE - clientY) / 4);
    } else if (clientY > rect.bottom - EDGE_ZONE) {
      speed = Math.min(MAX_SCROLL_SPEED, (clientY - (rect.bottom - EDGE_ZONE)) / 4);
    }
    autoScrollSpeed.current = speed;
    if (speed === 0 || autoScrollFrame.current !== null) return;

    const step = () => {
      const el = scrollRef.current;
      if (!el || autoScrollSpeed.current === 0) {
        autoScrollFrame.current = null;
        return;
      }
      const before = el.scrollTop;
      el.scrollTop += autoScrollSpeed.current;
      // Tatsächlich gerollt (am Ende der Liste bleibt es stehen): Die
      // angehobene Kachel bleibt unter dem Finger, das Ziel folgt dem Inhalt.
      const rolled = el.scrollTop - before;
      setDrag((current) => {
        if (!current) return current;
        const moved = { ...current, dy: current.dy + rolled };
        return { ...moved, to: nearestIndex(lastPoint.current.x, lastPoint.current.y, moved) };
      });
      autoScrollFrame.current = requestAnimationFrame(step);
    };
    autoScrollFrame.current = requestAnimationFrame(step);
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>, index: number) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    closeMenu();
    const el = e.currentTarget;
    const pointerId = e.pointerId;
    startPoint.current = { x: e.clientX, y: e.clientY };
    isDragging.current = false;
    cancelPress();
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      isDragging.current = true;
      setDrag({ from: index, to: index, dx: 0, dy: 0 });
      try {
        el.setPointerCapture(pointerId);
      } catch {
        // Pointer-Capture ist optional
      }
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const dx = e.clientX - startPoint.current.x;
    const dy = e.clientY - startPoint.current.y;
    if (!isDragging.current) {
      if (Math.abs(dx) > MOVE_TOLERANCE || Math.abs(dy) > MOVE_TOLERANCE) cancelPress();
      return;
    }
    e.preventDefault();
    lastPoint.current = { x: e.clientX, y: e.clientY };
    updateAutoScroll(e.clientY);
    setDrag((current) => {
      if (!current) return current;
      const moved = { ...current, dx, dy };
      return { ...moved, to: nearestIndex(e.clientX, e.clientY, moved) };
    });
  };

  const finishPointer = (e: ReactPointerEvent<HTMLDivElement>, index: number) => {
    cancelPress();
    stopAutoScroll();
    const wasDragging = isDragging.current;
    isDragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Capture war evtl. nie gesetzt
    }
    if (wasDragging) {
      if (drag && drag.to !== drag.from) void movePage(drag.from, drag.to);
      setDrag(null);
      return;
    }
    setDrag(null);
    const moved =
      Math.abs(e.clientX - startPoint.current.x) > MOVE_TOLERANCE ||
      Math.abs(e.clientY - startPoint.current.y) > MOVE_TOLERANCE;
    if (!moved) {
      setCurrentPage(index);
      closePanel();
    }
  };

  const handlePointerCancel = () => {
    cancelPress();
    stopAutoScroll();
    isDragging.current = false;
    setDrag(null);
  };

  const handleDuplicate = (pageId: string) => {
    closeMenu();
    void duplicatePage(pageId);
  };

  const handleDelete = (pageId: string) => {
    if (confirmDeleteId !== pageId) {
      setConfirmDeleteId(pageId);
      return;
    }
    closeMenu();
    void deletePage(pageId);
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    closeMenu();
    const target = index + direction;
    if (target < 0 || target >= pages.length) return;
    void movePage(index, target);
  };

  const handleAddPage = () => {
    closeMenu();
    void addPage(pages.length - 1);
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-surface-light">
      <header className="flex items-center justify-between px-4 py-3 border-b border-black/5 bg-white/80 backdrop-blur-md">
        <h2 className="text-xl font-semibold text-ink">{t('Seiten')}</h2>
        <IconButton label={t('Übersicht schließen')} onClick={closePanel}>
          <CloseIcon />
        </IconButton>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4" onPointerDown={closeMenu}>
        <div className="flex flex-wrap gap-5 justify-center sm:justify-start">
          {pages.map((page, index) => {
            const isCurrent = index === currentPageIndex;
            const isLifted = drag?.from === index;
            const isDropTarget = drag !== null && drag.to === index && drag.from !== index;
            return (
              <div
                key={page.id}
                className="relative"
                style={{ width: thumbWidth, zIndex: isLifted ? 20 : undefined }}
              >
                <div
                  ref={(el) => {
                    if (el) tileRefs.current.set(index, el);
                    else tileRefs.current.delete(index);
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={
                    index === 0
                      ? t('Seite {n} (Titelseite) anzeigen', { n: index + 1 })
                      : t('Seite {n} anzeigen', { n: index + 1 })
                  }
                  onPointerDown={(e) => handlePointerDown(e, index)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={(e) => finishPointer(e, index)}
                  onPointerCancel={handlePointerCancel}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setCurrentPage(index);
                      closePanel();
                    }
                  }}
                  className={`overflow-hidden rounded-2xl bg-white select-none ${
                    isCurrent ? 'ring-[3px] ring-primary-blue' : 'ring-1 ring-black/10'
                  } ${isDropTarget ? 'outline-2 outline-dashed outline-primary-blue outline-offset-4' : ''}`}
                  style={{
                    width: thumbWidth,
                    height: thumbHeight,
                    touchAction: drag ? 'none' : 'pan-y',
                    transform: isLifted
                      ? `translate(${drag.dx}px, ${drag.dy}px) scale(1.05)`
                      : undefined,
                    boxShadow: isLifted ? '0 12px 28px rgba(30,58,95,0.35)' : undefined,
                    transition: drag ? undefined : 'transform 150ms ease-out',
                  }}
                >
                  <BookPageView
                    page={page}
                    items={itemsByPage.get(page.id) ?? []}
                    pageWidth={pageWidth}
                    pageHeight={pageHeight}
                    scale={scale}
                    mode="static"
                  />
                </div>

                <button
                  type="button"
                  aria-label={t('Menü für Seite {n}', { n: index + 1 })}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDeleteId(null);
                    setMenuPageId((current) => (current === page.id ? null : page.id));
                  }}
                  className="absolute top-1 right-1 w-11 h-11 flex items-center justify-center rounded-full bg-white/90 text-ink shadow-sm border border-black/5 active:scale-90 transition-transform"
                >
                  <MoreIcon />
                </button>

                {menuPageId === page.id && (
                  <div
                    className="absolute top-12 right-1 z-30 w-48 rounded-2xl bg-white shadow-xl border border-black/5 overflow-hidden"
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => handleDuplicate(page.id)}
                      className="w-full min-h-11 px-4 text-left text-base text-ink hover:bg-black/5"
                    >
                      {t('Duplizieren')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(index, -1)}
                      disabled={index === 0}
                      className="w-full min-h-11 px-4 text-left text-base text-ink hover:bg-black/5 disabled:opacity-40"
                    >
                      {t('Nach links')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(index, 1)}
                      disabled={index === pages.length - 1}
                      className="w-full min-h-11 px-4 text-left text-base text-ink hover:bg-black/5 disabled:opacity-40"
                    >
                      {t('Nach rechts')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(page.id)}
                      disabled={pages.length <= 1}
                      className="w-full min-h-11 px-4 text-left text-base text-[#E5484D] hover:bg-black/5 disabled:opacity-40"
                    >
                      {confirmDeleteId === page.id ? t('Wirklich löschen?') : t('Löschen')}
                    </button>
                  </div>
                )}

                <div className="mt-2 text-center">
                  <div className="text-base font-semibold text-ink">{index + 1}</div>
                  {index === 0 && <div className="text-xs text-ink-soft">{t('Titelseite')}</div>}
                </div>
              </div>
            );
          })}

          <div style={{ width: thumbWidth }}>
            <button
              type="button"
              onClick={handleAddPage}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary-blue/60 text-primary-blue bg-white/60 active:scale-95 transition-transform"
              style={{ width: thumbWidth, height: thumbHeight }}
            >
              <PlusIcon />
              <span className="text-base font-semibold">{t('Seite')}</span>
            </button>
            <div className="mt-2 text-center text-base font-semibold text-transparent select-none">+</div>
          </div>
        </div>
      </div>

      {/* Ohne Hinweis findet das Ziehen niemand – es beginnt erst nach kurzem Halten */}
      <p className="px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 text-center text-xs text-ink-soft">
        {t('Zum Umsortieren eine Seite gedrückt halten und an ihren neuen Platz ziehen.')}
      </p>
    </div>
  );
}
