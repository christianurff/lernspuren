import React, { useEffect, useRef, useState } from 'react';
import type { Project } from '../../types';
import { BOOK_FORMATS } from '../../types';
import { useT } from '../../i18n';

interface ProjectTileProps {
  project: Project;
  onOpen: () => void;
  onDelete: () => void;
}

export function ProjectTile({ project, onOpen, onDelete }: ProjectTileProps) {
  const t = useT();
  const [showMenu, setShowMenu] = useState(false);
  // Overlay erst im nächsten Frame einhängen, sonst schließt der synthetische
  // Click nach einem Long-Press das Menü sofort wieder.
  const [isOverlayArmed, setIsOverlayArmed] = useState(false);
  // Nach einem Long-Press folgt auf Touch-Geräten noch ein Click: den verschlucken.
  const suppressClickRef = useRef(false);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openMenu = () => {
    suppressClickRef.current = true;
    setShowMenu(true);
  };

  const closeMenu = () => {
    setShowMenu(false);
    setIsOverlayArmed(false);
  };

  const handleContextMenu = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    openMenu();
  };

  const clearPressTimer = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const handleTouchStart = () => {
    suppressClickRef.current = false;
    clearPressTimer();
    pressTimerRef.current = setTimeout(openMenu, 500);
  };

  const handleTouchEnd = () => {
    clearPressTimer();
  };

  const handleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onOpen();
  };

  useEffect(() => clearPressTimer, []);

  // Nach dem Öffnen zuerst den Ghost-Click abfangen, dann das Overlay im
  // nächsten Frame aktivieren (Fallback-Timeout für Maus/Rechtsklick ohne Click).
  useEffect(() => {
    if (!showMenu) return;
    let frame = 0;

    const arm = () => {
      frame = requestAnimationFrame(() => setIsOverlayArmed(true));
    };
    const onGhostClick = (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      suppressClickRef.current = false;
      stopWaiting();
      arm();
    };
    const timer = setTimeout(() => {
      stopWaiting();
      arm();
    }, 400);
    function stopWaiting() {
      document.removeEventListener('click', onGhostClick, true);
      clearTimeout(timer);
    }

    document.addEventListener('click', onGhostClick, true);

    return () => {
      stopWaiting();
      cancelAnimationFrame(frame);
    };
  }, [showMenu]);

  const isBook = project.kind === 'book';
  const pageCount = project.pageCount ?? 1;
  const cardCountLabel = isBook
    ? pageCount === 1
      ? t('{n} Seite', { n: pageCount })
      : t('{n} Seiten', { n: pageCount })
    : project.cardCount === 1
      ? t('{n} Karte', { n: project.cardCount })
      : t('{n} Karten', { n: project.cardCount });

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchEnd}
        className="w-full bg-white rounded-2xl shadow-[0_4px_10px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-200 hover:scale-[1.02] active:scale-95 overflow-hidden flex flex-col text-left"
      >
        {isBook ? (
          <BookCover project={project} />
        ) : project.coverImage ? (
          <div className="h-32 overflow-hidden">
            <img
              src={project.coverImage}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div
            className="h-32 flex flex-col items-center justify-center gap-1"
            style={{
              background: `linear-gradient(135deg, ${project.backgroundColor} 0%, ${project.backgroundColor} 60%, ${project.backgroundColor}CC 100%)`,
            }}
          >
            <svg
              className="w-10 h-10 text-ink-soft/40"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <span className="text-xs text-ink-soft/40">{cardCountLabel}</span>
          </div>
        )}
        <div className="px-3 py-2.5 bg-white">
          <h3 className="text-[15px] font-semibold text-ink truncate">{project.name}</h3>
          <p className="text-xs text-ink-soft flex items-center gap-1.5">
            {isBook && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-blue/10 text-primary-blue px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide">
                {t('Buch')}
              </span>
            )}
            {cardCountLabel}
          </p>
        </div>
      </button>

      {/* Context Menu */}
      {showMenu && (
        <>
          {isOverlayArmed && (
            <div
              className="fixed inset-0 z-40"
              onClick={closeMenu}
            />
          )}
          <div className="absolute top-2 right-2 z-50 bg-white rounded-xl shadow-xl overflow-hidden">
            <button
              onClick={() => {
                closeMenu();
                onDelete();
              }}
              className="flex items-center gap-2 px-4 py-3 text-red-500 hover:bg-red-50 w-full"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              {t('Löschen')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Buch-Kachel: Cover mit Buchrücken (gerendert aus Seite 1, sonst Platzhalter).
// Die Kachel folgt dem Seitenformat des Buches – ein Querformat-Buch als
// Hochformat zu zeigen, würde das Cover beschneiden und täuscht die Form vor.
function BookCover({ project }: { project: Project }) {
  const format = project.bookFormat ?? 'portrait';
  const { width, height } = BOOK_FORMATS[format];
  // Querformat bekommt etwas weniger Höhe, sonst wird die Kachel sehr breit
  const coverHeight = format === 'landscape' ? 92 : 104;
  const coverWidth = Math.round(coverHeight * (width / height));

  return (
    <div className="h-32 bg-gradient-to-br from-[#E8EEFF] to-[#F5F7FF] flex items-center justify-center overflow-hidden">
      <div
        className="relative rounded-r-md rounded-l-[3px] bg-white shadow-[0_6px_14px_rgba(30,58,95,0.18)] overflow-hidden"
        style={{ width: coverWidth, height: coverHeight }}
      >
        {/* Buchrücken */}
        <div className="absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-black/15 to-transparent z-10" />
        {project.coverImage ? (
          <img src={project.coverImage} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 px-2">
            <svg className="w-8 h-8 text-primary-blue/50" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5v-15z" />
              <path strokeLinecap="round" d="M4 20.5A2.5 2.5 0 016.5 18H20v3H6.5" />
            </svg>
            <span className="text-[10px] text-ink-soft/70 text-center leading-tight line-clamp-2">{project.name}</span>
          </div>
        )}
      </div>
    </div>
  );
}
