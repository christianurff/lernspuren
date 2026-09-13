import { useRef } from 'react';
import type { BookVideoItem } from '../../types';
import { useMediaObjectUrl } from '../../utils/mediaUrl';
import { useTrimmedPlayback } from '../../hooks/useTrimmedPlayback';
import { useT } from '../../i18n';

interface BookInlineVideoProps {
  item: BookVideoItem;
  scale: number; // Seitenpunkte -> CSS-Pixel
  onClose: () => void;
}

/**
 * Video an seinem Platz auf der Seite abspielen — im Editor über den Play-Knopf
 * des Videos, ohne dafür in den Lesemodus zu wechseln.
 *
 * Liegt bewusst außerhalb des skalierten Seiten-Containers: die Bedienleiste des
 * `<video>` bliebe sonst mitskaliert und wäre auf kleinen Seiten kaum zu treffen.
 */
export function BookInlineVideo({ item, scale, onClose }: BookInlineVideoProps) {
  const t = useT();
  const videoUrl = useMediaObjectUrl(item.videoData);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Beschnitt ohne Neukodierung: nur zwischen trimStart und trimEnd abspielen
  const beschnitt = useTrimmedPlayback(videoRef, item.trimStart, item.trimEnd);

  return (
    <div
      data-book-inline-media=""
      style={{
        position: 'absolute',
        left: item.x * scale,
        top: item.y * scale,
        width: item.width * scale,
        height: item.height * scale,
        transform: `rotate(${item.rotation}deg)`,
        transformOrigin: 'center center',
        zIndex: 25,
        touchAction: 'auto',
      }}
      // Gesten gehören hier der Zeitleiste, nicht dem Verschieben oder Blättern
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
        onTimeUpdate={beschnitt.onTimeUpdate}
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
        onClick={onClose}
        className="absolute -top-3 -right-3 w-11 h-11 rounded-full flex items-center justify-center text-white bg-ink/80 hover:bg-ink active:scale-90 transition-all shadow-lg"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
