import { useEffect, useMemo } from 'react';
import { parseDataUrl } from './mediaFormats';

/**
 * Wandelt eine Data-URL in eine Blob-URL um.
 * Safari (insb. iPad) spielt große Data-URLs in <video>/<audio> unzuverlässig ab,
 * Blob-URLs dagegen zuverlässig – sie unterstützen auch Range-Requests.
 */
export function dataUrlToObjectUrl(dataUrl: string): string | null {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  try {
    return URL.createObjectURL(new Blob([parsed.bytes], { type: parsed.mimeType }));
  } catch {
    return null;
  }
}

// Blob-URLs werden je Data-URL geteilt und ihre Nutzer gezählt. Das spart
// Speicher, wenn dieselbe Aufnahme an mehreren Stellen zu sehen ist (Seite und
// Inspektor), und es überlebt ein Aus- und sofortiges Wiedereinhängen – React
// macht das im StrictMode bei jedem Einhängen einmal.
const objektUrls = new Map<string, { url: string; nutzer: number }>();

/** Blob-URL zu einer Data-URL, ohne sie zu belegen (für den Render). */
function objektUrlFuer(source: string): string {
  const vorhanden = objektUrls.get(source);
  if (vorhanden) return vorhanden.url;
  const url = dataUrlToObjectUrl(source);
  if (!url) return source; // unlesbare Data-URL: unverändert durchreichen
  objektUrls.set(source, { url, nutzer: 0 });
  return url;
}

function belegen(source: string) {
  const eintrag = objektUrls.get(source);
  if (eintrag) eintrag.nutzer += 1;
}

function freigeben(source: string) {
  const eintrag = objektUrls.get(source);
  if (!eintrag) return;
  eintrag.nutzer -= 1;
  if (eintrag.nutzer > 0) return;
  // Nicht sofort freigeben: wird gleich wieder eingehängt, bleibt dieselbe URL
  // gültig und das bereits gerenderte <video> behält eine gültige Quelle.
  setTimeout(() => {
    const jetzt = objektUrls.get(source);
    if (!jetzt || jetzt.nutzer > 0 || jetzt.url !== eintrag.url) return;
    objektUrls.delete(source);
    URL.revokeObjectURL(jetzt.url);
  }, 0);
}

/**
 * Liefert für eine Medien-Data-URL eine Blob-URL (und räumt sie wieder auf).
 * Bei Blob-/HTTP-URLs wird der Wert unverändert durchgereicht. Die URL steht
 * bereits beim ersten Render bereit, damit <video>/<audio> sofort laden können.
 */
export function useMediaObjectUrl(source: string | undefined): string | undefined {
  const istDataUrl = !!source && source.startsWith('data:');
  const url = useMemo(
    () => (source && istDataUrl ? objektUrlFuer(source) : source),
    [source, istDataUrl]
  );

  useEffect(() => {
    if (!source || !istDataUrl) return;
    belegen(source);
    return () => freigeben(source);
  }, [source, istDataUrl]);

  return url;
}
