import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useBookPageSize, useBookStore } from '../../stores/useBookStore';
import { useBookUIStore } from '../../stores/useBookUIStore';
import { ttsService } from '../../services/ttsService';
import type { BookAudioItem, BookCaption, BookItem, BookVideoItem } from '../../types';
import { useMediaObjectUrl } from '../../utils/mediaUrl';
import { fitPageScale } from '../../utils/bookGeometry';
import { useTrimmedPlayback } from '../../hooks/useTrimmedPlayback';
import { BookPageView } from './BookPageView';
import { useT } from '../../i18n';
import { isNativeApp } from '../../utils/nativeBridge';

const PAGE_PADDING = 32;
// Platz unten für Seitenanzeige und Vorlesen-Button
const BOTTOM_RESERVE = 40;
const FLIP_MS = 450;
const FADE_MS = 220;
const SWIPE_THRESHOLD = 60;
const EDGE_TAP_RATIO = 0.15;
const READER_BG = '#0F1C2E';

type Direction = 1 | -1;

interface FlipState {
  to: number;
  direction: Direction;
  phase: 'start' | 'run';
}

function subscribeSpeaking(onChange: () => void): () => void {
  return ttsService.subscribe(onChange);
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function CloseIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: Direction }) {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      {direction === 1 ? <path d="M9 5l7 7-7 7" /> : <path d="M15 5l-7 7 7 7" />}
    </svg>
  );
}

const CAPTIONS_KEY = 'dokumentenraum_book_captions';

function readCaptionsSetting(): boolean {
  try {
    return window.localStorage.getItem(CAPTIONS_KEY) === '1';
  } catch {
    return false;
  }
}

function storeCaptionsSetting(enabled: boolean) {
  try {
    window.localStorage.setItem(CAPTIONS_KEY, enabled ? '1' : '0');
  } catch {
    // Einstellung ist optional
  }
}

/** Untertitel, der zur aktuellen Wiedergabezeit passt (letzter begonnener Abschnitt) */
function captionAt(captions: BookCaption[] | undefined, time: number): string | null {
  if (!captions || captions.length === 0) return null;
  let current: string | null = null;
  for (const caption of captions) {
    if (caption.start <= time + 0.05) current = caption.text;
    else break;
  }
  return current;
}

function CaptionIcon({ enabled }: { enabled: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" fill={enabled ? 'currentColor' : 'none'} />
      <path d="M7 12h5M14 12h3M7 15.5h3M12 15.5h5" stroke={enabled ? READER_BG : 'currentColor'} />
    </svg>
  );
}

/**
 * Untertitel-Leiste für Audio/Video: zeigt den zur Wiedergabezeit passenden
 * Abschnitt; ohne Zeitmarken den gesamten erkannten Text.
 */
function CaptionBar({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div
      className="max-w-[90vw] rounded-2xl px-5 py-3 text-center text-white text-xl font-semibold leading-snug"
      style={{ background: 'rgba(0,0,0,0.75)', textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}
      aria-live="polite"
    >
      {text}
    </div>
  );
}

function SpeakerIcon({ playing }: { playing: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      {playing ? <path d="M17 9l4 6M21 9l-4 6" /> : <path d="M16.5 8.5a5 5 0 010 7" />}
    </svg>
  );
}

export function BookReader() {
  const t = useT();
  const isReading = useBookUIStore((s) => s.isReading);
  const stopReading = useBookUIStore((s) => s.stopReading);

  const pages = useBookStore((s) => s.pages);
  const items = useBookStore((s) => s.items);
  const currentPageIndex = useBookStore((s) => s.currentPageIndex);
  const setCurrentPage = useBookStore((s) => s.setCurrentPage);
  const { width: pageWidth, height: pageHeight } = useBookPageSize();

  const [index, setIndex] = useState(currentPageIndex);
  const [flip, setFlip] = useState<FlipState | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [audioItem, setAudioItem] = useState<BookAudioItem | null>(null);
  const [videoItem, setVideoItem] = useState<BookVideoItem | null>(null);
  const [captionsEnabled, setCaptionsEnabled] = useState(readCaptionsSetting);
  const [mediaTime, setMediaTime] = useState(0);
  // Blob-URLs: Safari auf dem iPad spielt große Data-URLs nicht zuverlässig ab
  const audioUrl = useMediaObjectUrl(audioItem?.audioData);
  const videoUrl = useMediaObjectUrl(videoItem?.videoData);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const toggleCaptions = () => {
    setCaptionsEnabled((enabled) => {
      storeCaptionsSetting(!enabled);
      return !enabled;
    });
  };

  // Videos laufen entweder bildschirmfüllend oder an ihrem Platz auf der Seite
  const isInlineVideo = videoItem?.playback === 'inline';

  // Untertitel nur einblenden, wenn eingeschaltet und Text vorhanden
  const activeMedia = videoItem ?? audioItem;
  const hasCaptionText =
    !!activeMedia &&
    ((activeMedia.captions?.length ?? 0) > 0 || (activeMedia.type === 'audio' && !!activeMedia.transcription));
  const captionText = !captionsEnabled || !activeMedia
    ? null
    : captionAt(activeMedia.captions, mediaTime) ??
      (activeMedia.type === 'audio' && !activeMedia.captions?.length ? activeMedia.transcription ?? null : null);

  // Video-Beschnitt ohne Neukodierung: nur zwischen trimStart und trimEnd abspielen
  const beschnitt = useTrimmedPlayback(videoRef, videoItem?.trimStart, videoItem?.trimEnd);
  const handleVideoTime = () => {
    const video = videoRef.current;
    if (!video) return;
    // Untertitel laufen mit der Zeit im Video mit
    setMediaTime(video.currentTime);
    beschnitt.onTimeUpdate();
  };

  // Vorlese-Zustand direkt aus dem ttsService (externer Store)
  const isSpeaking = useSyncExternalStore(
    subscribeSpeaking,
    () => ttsService.isSpeaking(),
    () => false
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const flipTimer = useRef<number | null>(null);
  const animating = useRef(false);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  // Beim Öffnen auf der zuletzt bearbeiteten Seite starten (state-adjust during render)
  const [wasReading, setWasReading] = useState(isReading);
  if (isReading !== wasReading) {
    setWasReading(isReading);
    if (isReading) {
      setIndex(currentPageIndex);
      setFlip(null);
      setAudioItem(null);
      setVideoItem(null);
    }
  }

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

  // Bühne messen
  useEffect(() => {
    if (!isReading) return;
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    const rect = el.getBoundingClientRect();
    setSize({ width: rect.width, height: rect.height });
    return () => observer.disconnect();
  }, [isReading]);


  // Vollbild (optional, Fehler still ignorieren)
  useEffect(() => {
    if (!isReading) return;
    // In der iOS-App ist die Anzeige bereits Vollbild; WebKits eigene Vollbild-Ansicht würde ein zweites Schließen-Symbol einblenden
    if (!isNativeApp()) document.documentElement.requestFullscreen?.().catch(() => {});
    return () => {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [isReading]);

  // Timer aufräumen
  useEffect(() => {
    return () => {
      if (flipTimer.current !== null) window.clearTimeout(flipTimer.current);
      ttsService.stop();
    };
  }, []);

  const turnPage = useCallback(
    (direction: Direction) => {
      if (animating.current) return;
      const target = index + direction;
      if (target < 0 || target >= pages.length) return;
      ttsService.stop();
      setAudioItem(null);
      setVideoItem(null);
      animating.current = true;
      setFlip({ to: target, direction, phase: 'start' });
      const duration = prefersReducedMotion() ? FADE_MS : FLIP_MS;
      window.requestAnimationFrame(() => {
        setFlip((current) => (current && current.phase === 'start' ? { ...current, phase: 'run' } : current));
      });
      flipTimer.current = window.setTimeout(() => {
        flipTimer.current = null;
        animating.current = false;
        setIndex(target);
        setFlip(null);
      }, duration);
    },
    [index, pages.length]
  );

  const handleClose = useCallback(() => {
    ttsService.stop();
    setAudioItem(null);
    setVideoItem(null);
    if (flipTimer.current !== null) {
      window.clearTimeout(flipTimer.current);
      flipTimer.current = null;
    }
    animating.current = false;
    setCurrentPage(index);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    stopReading();
  }, [index, setCurrentPage, stopReading]);

  // Tastatur: Pfeile blättern, Escape schließt (erst Video-Overlay, dann Reader)
  useEffect(() => {
    if (!isReading) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        turnPage(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        turnPage(-1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (videoItem) setVideoItem(null);
        else handleClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isReading, turnPage, handleClose, videoItem]);

  const page = pages[index];

  const pageTexts = useMemo(() => {
    if (!page) return '';
    return (itemsByPage.get(page.id) ?? [])
      .filter((item): item is Extract<BookItem, { type: 'text' }> => item.type === 'text')
      .slice()
      .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))
      .map((item) => item.text.trim())
      .filter(Boolean)
      .join('. ');
  }, [itemsByPage, page]);

  if (!isReading || !page) return null;

  const scale = fitPageScale(
    pageWidth,
    pageHeight,
    size.width || 1,
    Math.max(1, (size.height || 1) - BOTTOM_RESERVE),
    PAGE_PADDING
  );
  const stageWidth = pageWidth * scale;
  const stageHeight = pageHeight * scale;
  const reduced = prefersReducedMotion();
  // Blätter-Tapflächen dürfen die Seite nicht überlappen (sonst gehen Tipper auf
  // Text/Audio/Video verloren): höchstens der freie Rand neben der Bühne.
  const edgeTapWidth = Math.max(
    0,
    Math.min(EDGE_TAP_RATIO * size.width, (size.width - stageWidth) / 2)
  );

  const handleItemActivate = (item: BookItem) => {
    if (item.type === 'text') {
      if (isSpeaking) ttsService.stop();
      else ttsService.speak(item.text);
      return;
    }
    if (item.type === 'audio') {
      ttsService.stop();
      setMediaTime(0);
      setAudioItem((current) => (current && current.id === item.id ? null : item));
      return;
    }
    if (item.type === 'video') {
      ttsService.stop();
      setAudioItem(null);
      setMediaTime(0);
      setVideoItem(item);
    }
  };

  const handleReadAloud = () => {
    if (isSpeaking) {
      ttsService.stop();
      return;
    }
    if (pageTexts) ttsService.speak(pageTexts);
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    swipeStart.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
    turnPage(dx < 0 ? 1 : -1);
  };

  const renderPage = (pageIndex: number, mode: 'read' | 'static', style: CSSProperties, key: string) => {
    const target = pages[pageIndex];
    if (!target) return null;
    return (
      <div
        key={key}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: stageWidth,
          height: stageHeight,
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '0 18px 50px rgba(0,0,0,0.5)',
          ...style,
        }}
      >
        <BookPageView
          page={target}
          items={itemsByPage.get(target.id) ?? []}
          pageWidth={pageWidth}
          pageHeight={pageHeight}
          scale={scale}
          mode={mode}
          onItemActivate={mode === 'read' ? handleItemActivate : undefined}
        />
      </div>
    );
  };

  // Blätter-Animation: die aktuelle Seite dreht um ihre linke (vorwärts)
  // bzw. rechte (rückwärts) Kante, darunter liegt bereits die Zielseite.
  const leavingStyle = (): CSSProperties => {
    if (!flip) return {};
    if (reduced) {
      return {
        opacity: flip.phase === 'run' ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-in-out`,
      };
    }
    const angle = flip.direction === 1 ? -180 : 180;
    return {
      transformOrigin: flip.direction === 1 ? 'left center' : 'right center',
      transform: `rotateY(${flip.phase === 'run' ? angle : 0}deg)`,
      transition: `transform ${FLIP_MS}ms ease-in-out`,
      backfaceVisibility: 'hidden',
      WebkitBackfaceVisibility: 'hidden',
    } as CSSProperties;
  };

  const canPrev = index > 0;
  const canNext = index < pages.length - 1;

  return (
    <div className="fixed inset-0 z-50 select-none" style={{ background: READER_BG }}>
      <div
        ref={containerRef}
        className="absolute inset-0 flex items-center justify-center"
        style={{ perspective: '2000px', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          swipeStart.current = null;
        }}
      >
        {size.width > 0 && (
          <div style={{ position: 'relative', width: stageWidth, height: stageHeight, transformStyle: 'preserve-3d' }}>
            {flip && renderPage(flip.to, 'static', {}, `under-${flip.to}`)}
            {renderPage(index, flip ? 'static' : 'read', leavingStyle(), `top-${index}`)}

            {/* Wiedergabe an Ort und Stelle: das Video liegt genau auf seinem Platz */}
            {videoItem && isInlineVideo && !flip && (
              <div
                style={{
                  position: 'absolute',
                  left: videoItem.x * scale,
                  top: videoItem.y * scale,
                  width: videoItem.width * scale,
                  height: videoItem.height * scale,
                  transform: `rotate(${videoItem.rotation}deg)`,
                  transformOrigin: 'center center',
                  zIndex: 5,
                  touchAction: 'auto',
                }}
                // Wischen auf dem Video blättert nicht um, sonst wäre die Zeitleiste unbedienbar
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
              >
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  autoPlay
                  playsInline
                  onLoadedMetadata={beschnitt.onLoadedMetadata}
                  onTimeUpdate={handleVideoTime}
                  onPlay={beschnitt.onPlay}
                  onSeeking={beschnitt.onSeeking}
                  style={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    borderRadius: 12,
                    background: '#000',
                  }}
                />
                <button
                  type="button"
                  aria-label={t('Video schließen')}
                  title={t('Video schließen')}
                  onClick={() => setVideoItem(null)}
                  className="absolute -top-3 -right-3 w-11 h-11 rounded-full flex items-center justify-center text-white bg-ink/80 hover:bg-ink active:scale-90 transition-all shadow-lg"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tippen auf den freien Rand neben der Seite blättert (max. 15 % der Breite) */}
      {edgeTapWidth > 0 && (
        <>
          <button
            type="button"
            aria-label={t('Vorherige Seite')}
            onClick={() => turnPage(-1)}
            disabled={!canPrev}
            className="absolute top-0 bottom-0 left-0 disabled:pointer-events-none"
            style={{ width: edgeTapWidth, background: 'transparent' }}
          />
          <button
            type="button"
            aria-label={t('Nächste Seite')}
            onClick={() => turnPage(1)}
            disabled={!canNext}
            className="absolute top-0 bottom-0 right-0 disabled:pointer-events-none"
            style={{ width: edgeTapWidth, background: 'transparent' }}
          />
        </>
      )}

      {canPrev && (
        <button
          type="button"
          aria-label={t('Vorherige Seite')}
          onClick={() => turnPage(-1)}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full flex items-center justify-center text-white bg-white/15 hover:bg-white/25 active:scale-90 transition-all"
        >
          <ChevronIcon direction={-1} />
        </button>
      )}
      {canNext && (
        <button
          type="button"
          aria-label={t('Nächste Seite')}
          onClick={() => turnPage(1)}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full flex items-center justify-center text-white bg-white/15 hover:bg-white/25 active:scale-90 transition-all"
        >
          <ChevronIcon direction={1} />
        </button>
      )}

      <button
        type="button"
        aria-label={t('Präsentation schließen')}
        onClick={handleClose}
        className="absolute top-4 right-4 w-14 h-14 rounded-full flex items-center justify-center text-white bg-white/20 hover:bg-white/30 active:scale-90 transition-all"
      >
        <CloseIcon />
      </button>

      {ttsService.isSupported() && (
        <button
          type="button"
          onClick={handleReadAloud}
          disabled={!isSpeaking && !pageTexts}
          className="absolute bottom-4 left-4 min-h-14 px-5 rounded-full flex items-center gap-2 text-white bg-white/20 hover:bg-white/30 active:scale-95 transition-all disabled:opacity-30"
        >
          <SpeakerIcon playing={isSpeaking} />
          <span className="text-base font-semibold">{isSpeaking ? t('Stopp') : t('Vorlesen')}</span>
        </button>
      )}

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/60 text-base font-medium pointer-events-none">
        {index + 1} / {pages.length}
      </div>

      {hasCaptionText && (
        <button
          type="button"
          onClick={toggleCaptions}
          aria-pressed={captionsEnabled}
          aria-label={captionsEnabled ? t('Untertitel ausblenden') : t('Untertitel einblenden')}
          className="absolute bottom-4 right-4 z-20 min-h-14 px-5 rounded-full flex items-center gap-2 text-white bg-white/20 hover:bg-white/30 active:scale-95 transition-all"
        >
          <CaptionIcon enabled={captionsEnabled} />
          <span className="text-base font-semibold">{t('Untertitel')}</span>
        </button>
      )}

      {audioItem && (
        <>
          <audio
            src={audioUrl}
            autoPlay
            onTimeUpdate={(e) => setMediaTime(e.currentTarget.currentTime)}
            onEnded={() => setAudioItem(null)}
            onError={() => setAudioItem(null)}
          />
          {captionText && (
            <div className="absolute bottom-44 left-1/2 -translate-x-1/2 flex justify-center pointer-events-none">
              <CaptionBar text={captionText} />
            </div>
          )}
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/90 text-ink shadow-xl">
            <SpeakerIcon playing />
            <span className="text-base font-medium">{t('Wird abgespielt …')}</span>
            <button
              type="button"
              onClick={() => setAudioItem(null)}
              className="min-h-11 px-4 rounded-full bg-primary-blue text-white text-base font-semibold active:scale-95 transition-transform"
            >
              {t('Stopp')}
            </button>
          </div>
        </>
      )}

      {/* Untertitel zum Video auf der Seite: unterhalb der Bühne, damit sie nichts verdecken */}
      {videoItem && isInlineVideo && captionText && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 flex justify-center pointer-events-none">
          <CaptionBar text={captionText} />
        </div>
      )}

      {videoItem && !isInlineVideo && (
        <div className="absolute inset-0 z-10 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.9)' }}>
          <div className="flex flex-col items-center gap-4">
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              autoPlay
              playsInline
              onLoadedMetadata={beschnitt.onLoadedMetadata}
              onTimeUpdate={handleVideoTime}
              onPlay={beschnitt.onPlay}
              onSeeking={beschnitt.onSeeking}
              className="max-w-[90vw] max-h-[70vh] rounded-xl"
            />
            <CaptionBar text={captionText} />
          </div>
          <button
            type="button"
            aria-label={t('Video schließen')}
            onClick={() => setVideoItem(null)}
            className="absolute top-4 right-4 w-14 h-14 rounded-full flex items-center justify-center text-white bg-white/20 hover:bg-white/30 active:scale-90 transition-all"
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </div>
  );
}
