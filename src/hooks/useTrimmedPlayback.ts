// Beschnitt ohne Neukodierung: Ein Video liegt vollständig gespeichert vor,
// abgespielt wird aber nur der Abschnitt zwischen `trimStart` und `trimEnd`.
//
// Nur am Ende zu pausieren reicht dafür nicht: Das Video bliebe hinter dem
// Schnitt stehen und ließe sich nicht wieder starten (ein Klick auf Play spielt
// den weggeschnittenen Rest). Deshalb springt die Wiedergabe am Ende an den
// Anfang zurück, und wer vor den Anfang scrubbt, landet ebenfalls dort.
import { useCallback, type RefObject } from 'react';

/** Kleine Toleranz, damit sich Klemmen und Suchlauf nicht gegenseitig aufschaukeln. */
const TOLERANZ = 0.05;

export interface TrimmedPlaybackHandlers {
  onLoadedMetadata: () => void;
  onTimeUpdate: () => void;
  onPlay: () => void;
  onSeeking: () => void;
}

/**
 * Handler für ein `<video>`, das nur seinen beschnittenen Teil zeigen soll.
 * Die Werte kommen aus dem Element (`trimStart`/`trimEnd`); fehlen sie, wird
 * nichts eingeschränkt.
 */
export function useTrimmedPlayback(
  videoRef: RefObject<HTMLVideoElement | null>,
  trimStart?: number,
  trimEnd?: number
): TrimmedPlaybackHandlers {
  const start = trimStart && trimStart > 0 ? trimStart : 0;
  const end = trimEnd && trimEnd > start ? trimEnd : undefined;

  /** Vor dem Anfang liegt Weggeschnittenes – dorthin klemmen. */
  const klemmeAnAnfang = useCallback(() => {
    const video = videoRef.current;
    if (!video || start <= 0) return;
    if (video.currentTime < start - TOLERANZ) video.currentTime = start;
  }, [videoRef, start]);

  const onLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (video && start > 0) video.currentTime = start;
  }, [videoRef, start]);

  const onTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (end !== undefined && video.currentTime >= end) {
      // Zurück an den Anfang und anhalten: so ist das Video sofort wieder startbar.
      if (!video.paused) video.pause();
      video.currentTime = start;
      return;
    }
    klemmeAnAnfang();
  }, [videoRef, start, end, klemmeAnAnfang]);

  return {
    onLoadedMetadata,
    onTimeUpdate,
    onPlay: klemmeAnAnfang,
    onSeeking: klemmeAnAnfang,
  };
}
