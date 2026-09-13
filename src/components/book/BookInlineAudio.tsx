import type { BookAudioItem } from '../../types';
import { useMediaObjectUrl } from '../../utils/mediaUrl';
import { useT } from '../../i18n';

interface BookInlineAudioProps {
  item: BookAudioItem;
  scale: number; // Seitenpunkte -> CSS-Pixel
  pageWidth: number;
  pageHeight: number;
  onClose: () => void;
}

// Die Bedienleiste braucht Platz: schmaler wird die native Zeitleiste unbrauchbar
const BAR_MIN_WIDTH = 300;
const BAR_HEIGHT = 64;
const EDGE = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Sprachaufnahme an ihrem Platz auf der Seite anhören — im Editor über den
 * Lautsprecher der Karte, ohne dafür in den Lesemodus zu wechseln (wie beim
 * Video, siehe BookInlineVideo).
 *
 * Liegt bewusst außerhalb des skalierten Seiten-Containers: die Bedienleiste des
 * `<audio>` bliebe sonst mitskaliert und wäre auf kleinen Seiten kaum zu treffen.
 * Die durchsichtige Fläche über der Karte fängt Tipper ab, damit die Wiedergabe
 * nicht sofort wieder von vorn beginnt.
 */
export function BookInlineAudio({ item, scale, pageWidth, pageHeight, onClose }: BookInlineAudioProps) {
  const t = useT();
  const audioUrl = useMediaObjectUrl(item.audioData);

  const stageWidth = pageWidth * scale;
  const stageHeight = pageHeight * scale;
  const itemLeft = item.x * scale;
  const itemTop = item.y * scale;

  // Leiste mittig auf der Karte, aber immer innerhalb der Seite
  const width = clamp(item.width * scale, BAR_MIN_WIDTH, Math.max(BAR_MIN_WIDTH, stageWidth - 2 * EDGE));
  const barLeft = clamp((item.x + item.width / 2) * scale - width / 2, EDGE, stageWidth - width - EDGE);
  const barTop = clamp((item.y + item.height / 2) * scale - BAR_HEIGHT / 2, EDGE, stageHeight - BAR_HEIGHT - EDGE);

  return (
    <div
      data-book-inline-media=""
      style={{
        position: 'absolute',
        left: itemLeft,
        top: itemTop,
        width: item.width * scale,
        height: item.height * scale,
        zIndex: 25,
        touchAction: 'auto',
      }}
      // Gesten gehören hier der Zeitleiste, nicht dem Verschieben oder Blättern
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <div
        style={{
          position: 'absolute',
          left: barLeft - itemLeft,
          top: barTop - itemTop,
          width,
          height: BAR_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 10px',
          borderRadius: 16,
          backgroundColor: '#FFFFFF',
          boxShadow: '0 6px 20px rgba(30,58,95,0.18)',
          border: '1px solid rgba(255,255,255,0.6)',
        }}
      >
        <audio
          src={audioUrl}
          controls
          autoPlay
          onError={onClose}
          style={{ display: 'block', flex: '1 1 auto', minWidth: 0, height: 44 }}
        />
        {/* Neben der Bedienleiste, nicht darüber: sonst verdeckt der Knopf die
            Zeitleiste. Ein Tipp irgendwo daneben beendet die Wiedergabe auch. */}
        <button
          type="button"
          aria-label={t('Aufnahme schließen')}
          title={t('Aufnahme schließen')}
          onClick={onClose}
          className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white bg-ink/80 hover:bg-ink active:scale-90 transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
