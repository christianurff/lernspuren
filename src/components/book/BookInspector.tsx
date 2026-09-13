import { useRef, useState } from 'react';
import { useUIStore } from '../../stores';
import { useBookStore } from '../../stores/useBookStore';
import { useBookUIStore } from '../../stores/useBookUIStore';
import { DRAWING_COLORS } from '../../theme';
import {
  BOOK_FONT_FAMILIES,
  BOOK_FONT_SIZES,
  BOOK_PAGE_COLORS,
  type BookFontFamily,
  type BookItem,
  type BookPagePattern,
  type BookTextAlign,
  type BookVideoPlayback,
} from '../../types';
import { useT } from '../../i18n';
import { useMediaObjectUrl } from '../../utils/mediaUrl';
import { createVideoThumbnailFromBlob } from '../../utils/videoThumbnail';
import { isNativeVideoTrimAvailable, trimVideoNatively } from '../../utils/nativeBridge';
import {
  canTranscribeRecording,
  captionsToText,
  transcribeMedia,
  type TranscriptionError,
} from '../../services/transcriptionService';
import type { BookAudioItem, BookVideoItem } from '../../types';

// Farbauswahl für Text/Rahmen: Zeichenfarben plus Weiß
const ITEM_COLORS: { name: string; color: string }[] = [...DRAWING_COLORS, { name: 'Weiß', color: '#FFFFFF' }];

const PATTERNS: { value: BookPagePattern; label: string }[] = [
  { value: 'none', label: 'Keins' },
  { value: 'lines', label: 'Linien' },
  { value: 'grid', label: 'Karo' },
  { value: 'dots', label: 'Punkte' },
];

const PLAYBACK_OPTIONS: { value: BookVideoPlayback; label: string }[] = [
  { value: 'fullscreen', label: 'Vollbild' },
  { value: 'inline', label: 'Auf der Seite' },
];

const CORNER_OPTIONS: { label: string; radius: number }[] = [
  { label: 'Eckig', radius: 0 },
  { label: 'Rund', radius: 24 },
  { label: 'Sehr rund', radius: 64 },
];

// --- kleine Bausteine --------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="text-[13px] font-bold uppercase tracking-wide text-ink-soft mb-2">{title}</h3>
      {children}
    </section>
  );
}

function CheckMark() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

interface ColorDotProps {
  color: string;
  name: string;
  selected: boolean;
  onClick: () => void;
}

function ColorDot({ color, name, selected, onClick }: ColorDotProps) {
  // Auf sehr hellen Farben muss der Haken dunkel sein
  const isDark = ['#1F2937', '#1E3A5F', '#EF4444', '#3B82F6', '#8B5CF6', '#EC4899', '#22C55E'].includes(
    color.toUpperCase()
  );
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={name}
      aria-pressed={selected}
      title={name}
      className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90 border-2 ${
        selected ? 'border-primary-blue' : 'border-black/10'
      }`}
      style={{ backgroundColor: color }}
    >
      {selected && <span className={isDark ? 'text-white' : 'text-ink'}>{<CheckMark />}</span>}
    </button>
  );
}

interface ChoiceProps {
  label: React.ReactNode;
  selected: boolean;
  onClick: () => void;
  className?: string;
  ariaLabel?: string;
}

function Choice({ label, selected, onClick, className = '', ariaLabel }: ChoiceProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className={`min-h-[44px] px-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-1 transition-all duration-200 active:scale-95 border-2 ${
        selected ? 'border-primary-blue bg-primary-blue/10 text-ink' : 'border-black/10 bg-white text-ink-soft hover:bg-black/5'
      } ${className}`}
    >
      {label}
    </button>
  );
}

function PatternPreview({ pattern }: { pattern: BookPagePattern }) {
  return (
    <svg className="w-10 h-8" viewBox="0 0 40 32" aria-hidden="true">
      <rect x="0.5" y="0.5" width="39" height="31" rx="4" fill="#FFFFFF" stroke="#D8DEE9" />
      {pattern === 'lines' &&
        [10, 16, 22].map((y) => <line key={y} x1="6" y1={y} x2="34" y2={y} stroke="#B7C2D6" strokeWidth="1.5" />)}
      {pattern === 'grid' && (
        <g stroke="#B7C2D6" strokeWidth="1.2">
          {[10, 16, 22].map((y) => (
            <line key={`h${y}`} x1="6" y1={y} x2="34" y2={y} />
          ))}
          {[12, 20, 28].map((x) => (
            <line key={`v${x}`} x1={x} y1="6" x2={x} y2="26" />
          ))}
        </g>
      )}
      {pattern === 'dots' && (
        <g fill="#B7C2D6">
          {[10, 16, 22].map((y) => [12, 20, 28].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />))}
        </g>
      )}
    </svg>
  );
}

// Vorschau-Icon für die Wiedergabeart: Bildschirm bzw. Video auf einer Buchseite
function PlaybackIcon({ mode }: { mode: BookVideoPlayback }) {
  return (
    <svg className="w-7 h-6" viewBox="0 0 32 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <rect x="1" y="1" width="30" height="22" rx="3" />
      {mode === 'inline' && <rect x="6" y="6" width="13" height="10" rx="2" fill="currentColor" opacity="0.18" />}
      {mode === 'inline' ? (
        <path d="M11 8.5v5l4-2.5-4-2.5z" fill="currentColor" stroke="none" />
      ) : (
        <path d="M13 8v8l7-4-7-4z" fill="currentColor" stroke="none" />
      )}
      {mode === 'inline' && <path d="M22 8h5M22 12h5M22 16h3" strokeLinecap="round" opacity="0.5" />}
    </svg>
  );
}

// --- Ausrichtungs-Icons ------------------------------------------------------

function AlignIcon({ align }: { align: BookTextAlign }) {
  const lines: Record<BookTextAlign, { x1: number; x2: number }[]> = {
    left: [
      { x1: 4, x2: 20 },
      { x1: 4, x2: 14 },
      { x1: 4, x2: 18 },
    ],
    center: [
      { x1: 4, x2: 20 },
      { x1: 7, x2: 17 },
      { x1: 5, x2: 19 },
    ],
    right: [
      { x1: 4, x2: 20 },
      { x1: 10, x2: 20 },
      { x1: 6, x2: 20 },
    ],
  };
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      {lines[align].map((l, i) => (
        <line key={i} x1={l.x1} y1={7 + i * 5} x2={l.x2} y2={7 + i * 5} strokeLinecap="round" />
      ))}
    </svg>
  );
}

function formatSeconds(value: number): string {
  const mins = Math.floor(value / 60);
  const secs = Math.floor(value % 60);
  const tenths = Math.floor((value * 10) % 10);
  return `${mins}:${secs.toString().padStart(2, '0')},${tenths}`;
}

interface VideoTrimSectionProps {
  item: BookVideoItem;
  onChange: (changes: Partial<BookVideoItem>) => void;
}

/**
 * Video beschneiden. In der iOS-App übernimmt das der System-Videoeditor und
 * schneidet wirklich; im Browser bleibt es beim virtuellen Beschnitt (Anfang und
 * Ende als Zeitmarken, die Wiedergabe hält sich daran). Bewusst immer nur ein
 * Weg – zwei Beschnitt-Bedienungen nebeneinander verwirren mehr, als sie nützen.
 */
function VideoTrimSection({ item, onChange }: VideoTrimSectionProps) {
  const t = useT();
  const showToast = useUIStore((s) => s.showToast);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(item.duration ?? 0);

  // Kann die App gerade nicht schneiden (z. B. WebM aus dem Browser), fällt die
  // Bedienung auf die Wiedergabegrenzen zurück, statt still nichts zu tun.
  const [isTrimming, setIsTrimming] = useState(false);
  const [nativeFailed, setNativeFailed] = useState(false);
  const useNative = isNativeVideoTrimAvailable() && !nativeFailed;

  // Vorschau nur laden, wenn hier auch beschnitten wird (spart Speicher).
  const videoUrl = useMediaObjectUrl(useNative ? undefined : item.videoData);

  const trimStart = item.trimStart ?? 0;
  const trimEnd = item.trimEnd ?? duration;
  const hasTrim = trimStart > 0 || item.trimEnd !== undefined;

  const setStartHere = () => {
    const value = Math.round(current * 10) / 10;
    if (item.trimEnd !== undefined && value >= item.trimEnd - 0.5) return;
    onChange({ trimStart: value > 0 ? value : undefined });
  };
  const setEndHere = () => {
    const value = Math.round(current * 10) / 10;
    if (value <= (item.trimStart ?? 0) + 0.5) return;
    onChange({ trimEnd: duration > 0 && value >= duration - 0.05 ? undefined : value });
  };
  const reset = () => onChange({ trimStart: undefined, trimEnd: undefined });

  const trimNatively = async () => {
    setIsTrimming(true);
    try {
      const outcome = await trimVideoNatively(item.videoData, item.mimeType);
      // Abbruch, „gerade beschäftigt“ und Zeitablauf sagen nichts über das Video
      // aus – der Schnitt bleibt also der native, es geht nur gerade nicht.
      if (outcome.status === 'cancelled' || outcome.status === 'timeout') return;
      if (outcome.status === 'busy') {
        showToast(t('Es wird schon ein Video geschnitten. Versuche es gleich noch einmal.'));
        return;
      }
      if (outcome.status !== 'ok') {
        setNativeFailed(true);
        return;
      }
      const result = outcome.video;
      let thumbnailData = item.thumbnailData;
      try {
        const blob = await (await fetch(result.videoData)).blob();
        const thumb = await createVideoThumbnailFromBlob(blob);
        if (thumb) thumbnailData = thumb;
      } catch {
        // Vorschaubild ist optional
      }
      onChange({
        videoData: result.videoData,
        mimeType: result.mimeType,
        duration: result.duration,
        thumbnailData,
        // Der echte Schnitt macht die reinen Wiedergabegrenzen gegenstandslos.
        trimStart: undefined,
        trimEnd: undefined,
      });
    } finally {
      setIsTrimming(false);
    }
  };

  if (useNative) {
    return (
      <Section title={t('Video schneiden')}>
        <button
          type="button"
          onClick={() => void trimNatively()}
          disabled={isTrimming}
          className="w-full min-h-[44px] rounded-full bg-primary-blue text-white font-semibold text-sm active:scale-95 disabled:opacity-60"
        >
          {isTrimming ? t('Video wird geschnitten …') : t('Video schneiden')}
        </button>
        <p className="mt-2 text-sm text-ink-soft">
          {t('Anfang und Ende wählst du im Schnittfenster. Der Schnitt wird dauerhaft gespeichert – das Video wird ersetzt.')}
        </p>
        {hasTrim && (
          <button
            type="button"
            onClick={reset}
            className="mt-2 w-full min-h-[44px] rounded-full text-ink-soft font-semibold text-sm hover:bg-black/5 active:scale-95"
          >
            {t('Beschnitt aufheben')}
          </button>
        )}
      </Section>
    );
  }

  return (
    <Section title={t('Beschneiden')}>
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        playsInline
        preload="metadata"
        className="w-full rounded-2xl bg-black"
        onLoadedMetadata={(e) => {
          const value = e.currentTarget.duration;
          if (Number.isFinite(value) && value > 0) setDuration(value);
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
      />
      <p className="mt-2 text-sm text-ink-soft">
        {nativeFailed
          ? t('Dieses Video lässt sich hier nicht schneiden. Du kannst aber Anfang und Ende festlegen.')
          : t('Spiele bis zur gewünschten Stelle und setze dort Anfang oder Ende.')}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={setStartHere}
          className="min-h-[44px] rounded-full bg-primary-blue/10 text-primary-blue font-semibold px-3 text-sm active:scale-95"
        >
          {t('Anfang hier')} · {formatSeconds(trimStart)}
        </button>
        <button
          type="button"
          onClick={setEndHere}
          className="min-h-[44px] rounded-full bg-primary-blue/10 text-primary-blue font-semibold px-3 text-sm active:scale-95"
        >
          {t('Ende hier')} · {formatSeconds(trimEnd)}
        </button>
      </div>
      {hasTrim && (
        <button
          type="button"
          onClick={reset}
          className="mt-2 w-full min-h-[44px] rounded-full text-ink-soft font-semibold text-sm hover:bg-black/5 active:scale-95"
        >
          {t('Beschnitt aufheben')}
        </button>
      )}
    </Section>
  );
}

interface TranscriptSectionProps {
  item: BookAudioItem | BookVideoItem;
  onChange: (changes: Partial<BookItem>) => void;
}

/**
 * Erkannter Text zur Aufnahme — und in der iOS-App der Weg, ihn nachträglich
 * erkennen zu lassen. Beim Aufnehmen passiert das schon von selbst; hier hilft
 * es bei allem, was anders hereinkommt: Aufnahmen aus der Mediathek, Bücher aus
 * dem Browser und Versuche, die an einer noch fehlenden Berechtigung scheiterten.
 */
function TranscriptSection({ item, onChange }: TranscriptSectionProps) {
  const t = useT();
  const [isRecognizing, setIsRecognizing] = useState(false);
  // Nicht nur „ging nicht“, sondern warum – daran hängt, was zu tun ist.
  const [failure, setFailure] = useState<TranscriptionError | null>(null);
  const canRecognize = canTranscribeRecording();

  const captionText = item.captions?.length ? captionsToText(item.captions) : '';
  const text = (item.type === 'audio' ? item.transcription : undefined) || captionText;

  const recognize = async () => {
    setIsRecognizing(true);
    setFailure(null);
    try {
      const quelle = item.type === 'audio' ? item.audioData : item.videoData;
      const { captions, error } = await transcribeMedia(quelle, item.mimeType);
      const erkannt = captions ? captionsToText(captions) : '';
      if (!captions || !erkannt) {
        setFailure(error ?? 'other');
        return;
      }
      // Untertitel laufen zeitgenau mit; beim Audio steht zusätzlich der
      // fortlaufende Text im Inspektor.
      onChange(item.type === 'audio' ? { captions, transcription: erkannt } : { captions });
    } finally {
      setIsRecognizing(false);
    }
  };

  if (!text && !canRecognize) return null;

  return (
    <Section title={t('Erkannter Text')}>
      {text ? (
        <p className="text-sm text-ink-soft bg-black/5 rounded-2xl p-3 leading-relaxed">{text}</p>
      ) : (
        <p className="text-sm text-ink-soft">{t('Zu dieser Aufnahme gibt es noch keinen Text.')}</p>
      )}
      {canRecognize && (
        <button
          type="button"
          onClick={() => void recognize()}
          disabled={isRecognizing}
          className="mt-2 w-full min-h-[44px] rounded-full bg-primary-blue/10 text-primary-blue font-semibold text-sm active:scale-95 disabled:opacity-60"
        >
          {isRecognizing ? t('Wird erkannt …') : text ? t('Neu erkennen') : t('Text erkennen')}
        </button>
      )}
      {failure && (
        <p className="mt-1 text-xs text-ink-soft">
          {failure === 'permission'
            ? t('Die Spracherkennung ist nicht erlaubt. Du kannst sie in den Einstellungen unter Lernspuren einschalten.')
            : failure === 'language'
              ? t('Diese Sprache kann auf dem Gerät nicht offline erkannt werden.')
              : t('Es war nichts zu verstehen. Sprich beim Aufnehmen möglichst nah am Gerät.')}
        </p>
      )}
    </Section>
  );
}

// --- Inspektor ---------------------------------------------------------------

export function BookInspector() {
  const t = useT();
  const panel = useBookUIStore((s) => s.panel);
  const closePanel = useBookUIStore((s) => s.closePanel);
  const startCrop = useBookUIStore((s) => s.startCrop);

  const pages = useBookStore((s) => s.pages);
  const currentPageIndex = useBookStore((s) => s.currentPageIndex);
  const items = useBookStore((s) => s.items);
  const selectedItemId = useBookStore((s) => s.selectedItemId);
  const updatePage = useBookStore((s) => s.updatePage);
  const updateItem = useBookStore((s) => s.updateItem);
  const deleteItem = useBookStore((s) => s.deleteItem);

  const item = items.find((it) => it.id === selectedItemId) ?? null;

  // Bezeichnung der Audioaufnahme lokal bearbeiten
  const [labelDraft, setLabelDraft] = useState('');
  const [labelItemId, setLabelItemId] = useState<string | null>(null);
  const audioLabel = item && item.type === 'audio' ? item.label ?? '' : '';
  if (item && item.type === 'audio' && item.id !== labelItemId) {
    setLabelItemId(item.id);
    setLabelDraft(audioLabel);
  }

  if (panel !== 'inspector') return null;

  const page = pages[currentPageIndex];
  const set = (changes: Partial<BookItem>) => {
    if (item) void updateItem(item.id, changes);
  };

  return (
    <aside
      className="fixed inset-x-0 bottom-0 z-40 max-h-[55vh] overflow-y-auto rounded-t-[24px] bg-white shadow-xl border-t border-black/10 pb-[calc(1rem+env(safe-area-inset-bottom))] min-[900px]:static min-[900px]:z-auto min-[900px]:w-[320px] min-[900px]:shrink-0 min-[900px]:max-h-none min-[900px]:h-full min-[900px]:rounded-none min-[900px]:shadow-none min-[900px]:border-t-0 min-[900px]:border-l min-[900px]:pb-4"
      role="complementary"
      aria-label={t('Einstellungen')}
    >
      <div className="min-[900px]:hidden mx-auto mt-3 mb-1 h-1.5 w-12 rounded-full bg-black/15" />

      <div className="sticky top-0 z-10 bg-white flex items-center justify-between px-4 py-3 border-b border-black/5">
        <h2 className="text-lg font-bold text-ink">
          {item
            ? item.type === 'text'
              ? t('Text')
              : item.type === 'image'
              ? t('Bild')
              : item.type === 'video'
              ? t('Video')
              : item.type === 'audio'
              ? t('Aufnahme')
              : t('Zeichnung')
            : t('Seite')}
        </h2>
        <button
          type="button"
          onClick={closePanel}
          aria-label={t('Schließen')}
          title={t('Schließen')}
          className="w-11 h-11 rounded-full flex items-center justify-center text-ink-soft hover:bg-black/5 transition-colors active:scale-90"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="px-4 pt-4">
        {/* --- Seite --- */}
        {!item && page && (
          <>
            <Section title={t('Seitenfarbe')}>
              <div className="flex flex-wrap gap-3">
                {BOOK_PAGE_COLORS.map((c) => (
                  <ColorDot
                    key={c.color}
                    color={c.color}
                    name={t(c.name)}
                    selected={page.backgroundColor.toUpperCase() === c.color.toUpperCase()}
                    onClick={() => void updatePage(page.id, { backgroundColor: c.color })}
                  />
                ))}
              </div>
            </Section>

            <Section title={t('Muster')}>
              <div className="grid grid-cols-2 gap-3">
                {PATTERNS.map((p) => (
                  <Choice
                    key={p.value}
                    selected={(page.backgroundPattern ?? 'none') === p.value}
                    onClick={() => void updatePage(page.id, { backgroundPattern: p.value })}
                    className="flex-col py-3 gap-2"
                    label={
                      <>
                        <PatternPreview pattern={p.value} />
                        <span>{t(p.label)}</span>
                      </>
                    }
                  />
                ))}
              </div>
            </Section>
          </>
        )}

        {/* --- Text --- */}
        {item && item.type === 'text' && (
          <>
            <Section title={t('Schriftgröße')}>
              <div className="grid grid-cols-4 gap-2">
                {BOOK_FONT_SIZES.map((s) => (
                  <Choice
                    key={s.label}
                    label={s.label}
                    ariaLabel={t('Schriftgröße {size}', { size: s.label })}
                    selected={item.fontSize === s.size}
                    onClick={() => set({ fontSize: s.size })}
                  />
                ))}
              </div>
            </Section>

            <Section title={t('Schrift')}>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(BOOK_FONT_FAMILIES) as BookFontFamily[]).map((key) => (
                  <Choice
                    key={key}
                    selected={item.fontFamily === key}
                    onClick={() => set({ fontFamily: key })}
                    ariaLabel={t(BOOK_FONT_FAMILIES[key].label)}
                    className="flex-col py-3 gap-1"
                    label={
                      <>
                        <span className="text-2xl leading-none" style={{ fontFamily: BOOK_FONT_FAMILIES[key].css }}>
                          Aa
                        </span>
                        <span className="text-xs">{t(BOOK_FONT_FAMILIES[key].label)}</span>
                      </>
                    }
                  />
                ))}
              </div>
            </Section>

            <Section title={t('Stil')}>
              <div className="grid grid-cols-4 gap-2">
                <Choice
                  label={<span className="font-black text-lg">F</span>}
                  ariaLabel={t('Fett')}
                  selected={item.bold}
                  onClick={() => set({ bold: !item.bold })}
                />
                {(['left', 'center', 'right'] as BookTextAlign[]).map((a) => (
                  <Choice
                    key={a}
                    label={<AlignIcon align={a} />}
                    ariaLabel={a === 'left' ? t('Linksbündig') : a === 'center' ? t('Zentriert') : t('Rechtsbündig')}
                    selected={item.align === a}
                    onClick={() => set({ align: a })}
                  />
                ))}
              </div>
            </Section>

            <Section title={t('Textfarbe')}>
              <div className="flex flex-wrap gap-3">
                {ITEM_COLORS.map((c) => (
                  <ColorDot
                    key={c.color}
                    color={c.color}
                    name={t(c.name)}
                    selected={item.color.toUpperCase() === c.color.toUpperCase()}
                    onClick={() => set({ color: c.color })}
                  />
                ))}
              </div>
            </Section>

            <Section title={t('Hintergrund')}>
              <div className="flex flex-wrap gap-3 items-center">
                <Choice label={t('Keiner')} selected={!item.backgroundColor} onClick={() => set({ backgroundColor: undefined })} />
                {BOOK_PAGE_COLORS.map((c) => (
                  <ColorDot
                    key={c.color}
                    color={c.color}
                    name={t(c.name)}
                    selected={(item.backgroundColor ?? '').toUpperCase() === c.color.toUpperCase()}
                    onClick={() => set({ backgroundColor: c.color })}
                  />
                ))}
              </div>
            </Section>
          </>
        )}

        {/* --- Bild --- */}
        {item && item.type === 'image' && (
          <>
            <Section title={t('Rahmenfarbe')}>
              <div className="flex flex-wrap gap-3 items-center">
                <Choice label={t('Keiner')} selected={!item.borderColor} onClick={() => set({ borderColor: undefined })} />
                {ITEM_COLORS.map((c) => (
                  <ColorDot
                    key={c.color}
                    color={c.color}
                    name={t(c.name)}
                    selected={(item.borderColor ?? '').toUpperCase() === c.color.toUpperCase()}
                    onClick={() => set({ borderColor: c.color })}
                  />
                ))}
              </div>
            </Section>

            <Section title={t('Ecken')}>
              <div className="grid grid-cols-3 gap-2">
                {CORNER_OPTIONS.map((o) => (
                  <Choice
                    key={o.label}
                    label={t(o.label)}
                    selected={(item.borderRadius ?? 0) === o.radius}
                    onClick={() => set({ borderRadius: o.radius })}
                  />
                ))}
              </div>
            </Section>

            <Section title={t('Ausschnitt')}>
              <button
                type="button"
                onClick={() => startCrop(item.id)}
                className="w-full min-h-[48px] rounded-full bg-primary-blue/10 text-primary-blue font-semibold active:scale-95"
              >
                {t('Bild zuschneiden')}
              </button>
            </Section>
          </>
        )}

        {/* --- Audio --- */}
        {item && item.type === 'audio' && (
          <>
            <Section title={t('Bezeichnung')}>
              <input
                type="text"
                value={labelDraft}
                placeholder={t('z. B. Was ich gelernt habe')}
                onChange={(e) => setLabelDraft(e.target.value)}
                onBlur={() => set({ label: labelDraft.trim() || undefined })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                className="w-full h-12 px-4 rounded-2xl border-2 border-black/10 focus:border-primary-blue outline-none text-ink"
              />
            </Section>
            {/* key: der Fehlerzustand gehört zu diesem Element, nicht zum nächsten */}
            <TranscriptSection key={`text-${item.id}`} item={item} onChange={(changes) => set(changes)} />
          </>
        )}

        {/* --- Video --- */}
        {item && item.type === 'video' && (
          <>
            <Section title={t('Wiedergabe')}>
              <div className="grid grid-cols-2 gap-2">
                {PLAYBACK_OPTIONS.map((option) => (
                  <Choice
                    key={option.value}
                    selected={(item.playback ?? 'fullscreen') === option.value}
                    onClick={() => set({ playback: option.value })}
                    label={
                      <span className="flex flex-col items-center gap-1 py-1">
                        <PlaybackIcon mode={option.value} />
                        {t(option.label)}
                      </span>
                    }
                  />
                ))}
              </div>
              <p className="mt-2 text-[13px] text-ink-soft leading-snug">
                {(item.playback ?? 'fullscreen') === 'inline'
                  ? t('Das Video läuft beim Lesen an seinem Platz auf der Seite.')
                  : t('Das Video füllt beim Lesen den ganzen Bildschirm.')}
              </p>
            </Section>
            {/* key: Fehlerzustände gehören zu diesem Element, nicht zum nächsten */}
            <VideoTrimSection key={`trim-${item.id}`} item={item} onChange={(changes) => set(changes)} />
            <TranscriptSection key={`text-${item.id}`} item={item} onChange={(changes) => set(changes)} />
          </>
        )}

        {/* --- Löschen --- */}
        {item && (
          <button
            type="button"
            onClick={() => void deleteItem(item.id)}
            className="w-full min-h-[48px] mb-4 rounded-full text-[#EF4444] font-semibold transition-colors hover:bg-[#EF4444]/10 active:scale-95"
          >
            {t('Element löschen')}
          </button>
        )}
      </div>
    </aside>
  );
}
