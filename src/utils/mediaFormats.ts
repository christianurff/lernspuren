/**
 * Gemeinsame Medienformat-Hilfen für Whiteboard und Buch.
 *
 * Hintergrund: MediaRecorder liefert MIME-Typen mit Codec-Parametern wie
 * `video/webm;codecs=vp9,opus`. In einer Data-URL trennt aber das ERSTE Komma
 * Kopf und Daten – ein Komma im Codec-Parameter zerlegt die URL, Browser und
 * Parser lesen dann Unsinn und das Video bleibt schwarz. Deshalb landet nur der
 * Basistyp im Kopf, und der Parser hier kann auch alte, so beschädigte Daten lesen.
 */

/** `video/webm;codecs=vp9,opus` → `video/webm` */
export function baseMimeType(mimeType: string | undefined | null): string {
  return (mimeType ?? '').split(';')[0].trim().toLowerCase();
}

/**
 * Blob → Base64-Data-URL mit reinem Basistyp im Kopf.
 * `fallbackType` greift, wenn der Blob keinen Typ trägt.
 */
export function blobToDataUrl(blob: Blob, fallbackType = 'application/octet-stream'): Promise<string> {
  const type = baseMimeType(blob.type) || fallbackType;
  const clean = blob.type === type ? blob : new Blob([blob], { type });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Datei konnte nicht gelesen werden'));
    reader.readAsDataURL(clean);
  });
}

export interface ParsedDataUrl {
  mimeType: string;
  bytes: Uint8Array<ArrayBuffer>;
}

/**
 * Zerlegt eine Data-URL robust in MIME-Typ und Bytes.
 * Für Base64 zählt die Markierung `;base64,` (nicht das erste Komma), damit
 * Alt-Daten mit `codecs=vp9,opus` im Kopf weiterhin lesbar sind.
 */
export function parseDataUrl(dataUrl: string): ParsedDataUrl | null {
  if (!dataUrl.startsWith('data:')) return null;
  const base64Marker = dataUrl.indexOf(';base64,');
  let header: string;
  let payload: string;
  let isBase64: boolean;
  if (base64Marker >= 0) {
    header = dataUrl.slice(5, base64Marker);
    payload = dataUrl.slice(base64Marker + ';base64,'.length);
    isBase64 = true;
  } else {
    const comma = dataUrl.indexOf(',');
    if (comma < 0) return null;
    header = dataUrl.slice(5, comma);
    payload = dataUrl.slice(comma + 1);
    isBase64 = false;
  }
  const mimeType = baseMimeType(header) || 'application/octet-stream';
  try {
    let bytes: Uint8Array<ArrayBuffer>;
    if (isBase64) {
      const binary = atob(payload);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    } else {
      const encoded = new TextEncoder().encode(decodeURIComponent(payload));
      bytes = new Uint8Array(encoded.length);
      bytes.set(encoded);
    }
    return { mimeType, bytes };
  } catch {
    return null;
  }
}

/** Kandidaten in Vorzugsreihenfolge: MP4 zuerst (spielt überall, auch auf iPad/iPhone), dann WebM. */
const VIDEO_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9,opus',
  'video/webm',
];

const AUDIO_CANDIDATES = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm'];

type IsSupported = (type: string) => boolean;
type CanPlay = (type: string) => string;

/**
 * Wählt das Aufnahmeformat: das erste, das der Browser sowohl aufnehmen als
 * auch selbst abspielen kann. Safari meldet z. B. WebM/VP9 als aufnehmbar,
 * spielt es aber auf manchen Geräten nicht. `undefined` = Browser wählt selbst.
 */
export function pickRecordingMimeType(
  kind: 'video' | 'audio',
  isSupported: IsSupported = defaultIsSupported,
  canPlay: CanPlay = defaultCanPlay(kind)
): string | undefined {
  const candidates = kind === 'video' ? VIDEO_CANDIDATES : AUDIO_CANDIDATES;
  const playable = candidates.find((type) => isSupported(type) && canPlay(type) !== '');
  if (playable) return playable;
  // Notnagel: aufnehmbar, auch wenn canPlayType unsicher ist (manche Browser antworten leer)
  return candidates.find((type) => isSupported(type));
}

function defaultIsSupported(type: string): boolean {
  return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type);
}

function defaultCanPlay(kind: 'video' | 'audio'): CanPlay {
  const element = typeof document !== 'undefined' ? document.createElement(kind) : null;
  return (type) => element?.canPlayType(type) ?? '';
}
