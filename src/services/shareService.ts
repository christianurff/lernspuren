// Teilen per Link: Upload einer Buch-/Whiteboard-Datei zum Lernspuren-Worker (R2, mit Ablaufdatum).
// Die Datei verlässt dabei das Gerät und ist für jede Person mit dem Link abrufbar –
// der Hinweis dazu steht im Teilen-Dialog (ShareLinkModal).
import { dateLocale, t } from '../i18n';
import { isNativeApp } from '../utils/nativeBridge';

export type ShareKind = 'book' | 'canvas';
export type ShareExpiryDays = 7 | 30 | 90;
export const SHARE_EXPIRY_OPTIONS: ShareExpiryDays[] = [7, 30, 90];

export const SHARE_API_URL: string =
  (import.meta.env.VITE_SHARE_API_URL as string | undefined)?.replace(/\/$/, '') ??
  'https://lernspuren-share.urff.workers.dev';

export interface ShareResult {
  id: string;
  url: string;
  deleteToken: string;
  expiresAt: number;
  kind: ShareKind;
  size: number;
}

export interface ShareInfo {
  kind: ShareKind;
  name: string;
  expiresAt: number;
  size: number;
}

// Lokal gemerkte Freigaben (damit „Freigabe beenden" möglich bleibt)
export interface StoredShare extends ShareResult {
  projectId: string;
  projectName: string;
  createdAt: number;
}

const STORAGE_KEY = 'dokumentenraum_shares';

/** Größtmögliche Datei – muss zu MAX_BYTES im Worker passen (cloudflare-worker/worker.js). */
export const MAX_SHARE_BYTES = 60 * 1024 * 1024;

/** Zeitlimit für den Upload (sehr großzügig, fängt aber hängende Verbindungen ab). */
const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Feste Basis für Teilen-Links, wenn die Seite nicht im Web läuft.
 * In der iOS-App ist `window.location.origin` `app://lernspuren` – ein Link
 * darauf wäre für alle anderen unbrauchbar.
 */
const WEB_BASE_URL = 'https://lernspuren.urff.app/';

export function shareUrlFor(id: string): string {
  if (typeof window === 'undefined') return `${WEB_BASE_URL}#/open/${id}`;
  const protocol = window.location.protocol;
  const istWeb = protocol === 'http:' || protocol === 'https:';
  if (isNativeApp() || !istWeb) return `${WEB_BASE_URL}#/open/${id}`;
  return `${window.location.origin}${window.location.pathname}#/open/${id}`;
}

export function loadStoredShares(): StoredShare[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredShare[];
    if (!Array.isArray(parsed)) return [];
    // Abgelaufene Einträge still entfernen
    const now = Date.now();
    return parsed.filter((s) => s && typeof s.id === 'string' && s.expiresAt > now);
  } catch {
    return [];
  }
}

function persistStoredShares(shares: StoredShare[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shares));
  } catch {
    // z. B. Private Mode – dann fehlt nur der lokale Lösch-Schlüssel
  }
}

export function rememberShare(share: StoredShare) {
  persistStoredShares([share, ...loadStoredShares().filter((s) => s.id !== share.id)]);
}

export function forgetShare(id: string) {
  persistStoredShares(loadStoredShares().filter((s) => s.id !== id));
}

export function storedSharesForProject(projectId: string): StoredShare[] {
  return loadStoredShares().filter((s) => s.projectId === projectId);
}

/**
 * Datei hochladen. Nutzt XMLHttpRequest, damit der Fortschritt angezeigt werden kann.
 */
export function uploadShare(
  file: Blob,
  options: { kind: ShareKind; days: ShareExpiryDays; name: string; contentType?: string },
  onProgress?: (fraction: number) => void
): Promise<ShareResult> {
  return new Promise((resolve, reject) => {
    // Zu große Dateien gar nicht erst hochladen – der Worker würde mit 413 ablehnen.
    if (file.size > MAX_SHARE_BYTES) {
      reject(
        new Error(
          t(
            'Die Datei ist mit {size} zu groß zum Teilen (höchstens {max}). Entferne ein paar Videos oder Aufnahmen und versuche es erneut.',
            { size: formatBytes(file.size), max: formatBytes(MAX_SHARE_BYTES) }
          )
        )
      );
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${SHARE_API_URL}/share`);
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.setRequestHeader('Content-Type', options.contentType ?? file.type ?? 'application/octet-stream');
    xhr.setRequestHeader('X-Expires-Days', String(options.days));
    xhr.setRequestHeader('X-Kind', options.kind);
    xhr.setRequestHeader('X-Name', encodeURIComponent(options.name));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onerror = () => reject(new Error(t('Verbindung zum Teilen-Dienst fehlgeschlagen')));
    xhr.ontimeout = () => {
      xhr.abort();
      reject(new Error(t('Zeitüberschreitung beim Hochladen. Bitte Internetverbindung prüfen und erneut versuchen.')));
    };
    xhr.onload = () => {
      let data: Partial<ShareResult> & { error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText) as Partial<ShareResult> & { error?: string };
      } catch {
        // keine JSON-Antwort
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.id && data.deleteToken && data.expiresAt) {
        resolve({
          id: data.id,
          // Der Worker kennt die öffentliche Adresse selbst – die gilt auch dort,
          // wo die Web-App nicht unter https läuft (iOS-App).
          url:
            typeof data.url === 'string' && data.url.startsWith('https://')
              ? data.url
              : shareUrlFor(data.id),
          deleteToken: data.deleteToken,
          expiresAt: data.expiresAt,
          kind: data.kind ?? options.kind,
          size: data.size ?? file.size,
        });
      } else {
        reject(new Error(data.error || t('Hochladen fehlgeschlagen ({status})', { status: xhr.status })));
      }
    };
    xhr.send(file);
  });
}

export class ShareNotFoundError extends Error {
  readonly expired: boolean;

  constructor(expired: boolean) {
    super(expired ? t('Dieser Link ist abgelaufen') : t('Dieser Link ist ungültig'));
    this.expired = expired;
  }
}

export async function fetchShareInfo(id: string): Promise<ShareInfo> {
  const response = await fetch(`${SHARE_API_URL}/share/${encodeURIComponent(id)}`, { method: 'HEAD' });
  if (response.status === 404) throw new ShareNotFoundError(false);
  if (response.status === 410) throw new ShareNotFoundError(true);
  if (!response.ok) throw new Error(t('Teilen-Dienst antwortet nicht ({status})', { status: response.status }));
  return {
    kind: (response.headers.get('X-Kind') as ShareKind) || 'book',
    name: decodeURIComponent(response.headers.get('X-Name') || ''),
    expiresAt: Number(response.headers.get('X-Expires-At') || '0'),
    size: Number(response.headers.get('Content-Length') || '0'),
  };
}

export async function fetchShare(id: string): Promise<{ blob: Blob; info: ShareInfo }> {
  const response = await fetch(`${SHARE_API_URL}/share/${encodeURIComponent(id)}`);
  if (response.status === 404) throw new ShareNotFoundError(false);
  if (response.status === 410) throw new ShareNotFoundError(true);
  if (!response.ok) throw new Error(t('Teilen-Dienst antwortet nicht ({status})', { status: response.status }));
  const blob = await response.blob();
  return {
    blob,
    info: {
      kind: (response.headers.get('X-Kind') as ShareKind) || 'book',
      name: decodeURIComponent(response.headers.get('X-Name') || ''),
      expiresAt: Number(response.headers.get('X-Expires-At') || '0'),
      size: blob.size,
    },
  };
}

export async function deleteShare(id: string, deleteToken: string): Promise<void> {
  const response = await fetch(`${SHARE_API_URL}/share/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${deleteToken}` },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(t('Freigabe konnte nicht beendet werden ({status})', { status: response.status }));
  }
  forgetShare(id);
}

export function formatExpiry(expiresAt: number): string {
  return new Date(expiresAt).toLocaleDateString(dateLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
