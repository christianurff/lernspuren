// Lernspuren-Teilen: Ablage von Buch-/Whiteboard-Dateien mit Ablaufdatum in R2.
//
// Routen:
//   POST   /share            Body = Datei (EPUB/ZIP), Header X-Expires-Days (7|30|90),
//                            X-Kind (book|canvas), X-Name (Projektname, URL-kodiert)
//                            → { id, url, deleteToken, expiresAt }
//   GET    /share/:id        Datei (410, wenn abgelaufen; 404, wenn unbekannt)
//   HEAD   /share/:id        nur Metadaten (Content-Length, X-Kind, X-Name, X-Expires-At)
//   DELETE /share/:id        Header Authorization: Bearer <deleteToken> → 204
//
// Ablauf: Objekte liegen unter dem Präfix <tage>d/ (7d/, 30d/, 90d/). Für jedes Präfix
// gibt es eine R2-Lifecycle-Regel (siehe README), die Objekte nach dieser Zeit löscht.
// Zusätzlich prüft der Worker das in den Metadaten gespeicherte Ablaufdatum.

const ALLOWED_DAYS = [7, 30, 90];
const MAX_BYTES = 60 * 1024 * 1024; // 60 MB je Datei
const ALLOWED_KINDS = ['book', 'canvas'];
// Nur ZIP-Container (EPUB bzw. .lernspur) dürfen hochgeladen werden. Der Content-Type
// des Uploads wird NIE wieder ausgeliefert (siehe handleDownload), diese Liste ist nur
// eine erste Hürde; verbindlich sind die Magic-Bytes weiter unten.
const ALLOWED_CONTENT_TYPES = ['application/epub+zip', 'application/zip', 'application/octet-stream'];
// ZIP-Signatur "PK\x03\x04" – EPUB und .lernspur sind beides ZIP-Dateien.
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
// Kostenbremse: Das kostenlose R2-Kontingent liegt bei 10 GB. Wir bleiben deutlich darunter
// (Standard 5 GB, siehe MAX_TOTAL_MB in wrangler.toml) und begrenzen die Anzahl der Dateien,
// damit die Belegungsprüfung (ein List-Aufruf je Upload) günstig bleibt.
const DEFAULT_MAX_TOTAL_MB = 5 * 1024;
const DEFAULT_MAX_OBJECTS = 1000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (url.pathname === '/share' && request.method === 'POST') {
        // Uploads nur aus der eigenen Web-App bzw. dem iOS-Wrapper (Origin/Referer
        // serverseitig erzwingen – CORS allein schützt nur den Browser).
        if (!isAllowedOrigin(request, env)) {
          return withCors(json({ error: 'Nicht erlaubt' }, 403), cors);
        }
        const limited = await checkRateLimit(request, env);
        if (limited) return withCors(limited, cors);
        return withCors(await handleUpload(request, env), cors);
      }
      const match = url.pathname.match(/^\/share\/([A-Za-z0-9_-]{6,80})$/);
      if (match) {
        const id = match[1];
        if (request.method === 'GET' || request.method === 'HEAD') {
          return withCors(await handleDownload(id, env, request.method === 'HEAD'), cors);
        }
        if (request.method === 'DELETE') {
          return withCors(await handleDelete(id, request, env), cors);
        }
      }
      return withCors(json({ error: 'Nicht gefunden' }, 404), cors);
    } catch (error) {
      console.error('share error', error);
      return withCors(json({ error: 'Interner Fehler' }, 500), cors);
    }
  },
};

async function handleUpload(request, env) {
  const days = Number(request.headers.get('X-Expires-Days') || '30');
  if (!ALLOWED_DAYS.includes(days)) {
    return json({ error: 'Ungültiges Ablaufdatum' }, 400);
  }
  const kind = request.headers.get('X-Kind') || 'book';
  if (!ALLOWED_KINDS.includes(kind)) {
    return json({ error: 'Ungültige Projektart' }, 400);
  }
  const length = Number(request.headers.get('Content-Length') || '0');
  if (!length || Number.isNaN(length)) {
    return json({ error: 'Content-Length fehlt' }, 411);
  }
  if (length > MAX_BYTES) {
    return json({ error: `Datei zu groß (max. ${Math.round(MAX_BYTES / 1024 / 1024)} MB)` }, 413);
  }
  // Content-Type nur als Vorfilter (der Wert wird nie wieder ausgeliefert)
  const contentType = (request.headers.get('Content-Type') || 'application/octet-stream')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    return json({ error: 'Ungültiger Dateityp' }, 415);
  }
  const name = safeName(decodeUrlComponent(request.headers.get('X-Name') || ''));

  if (!request.body) {
    return json({ error: 'Keine Datei übertragen' }, 400);
  }

  // Gesamtbelegung prüfen (Kostenbremse)
  const maxTotalBytes = Number(env.MAX_TOTAL_MB || DEFAULT_MAX_TOTAL_MB) * 1024 * 1024;
  const maxObjects = Number(env.MAX_OBJECTS || DEFAULT_MAX_OBJECTS);
  const usage = await bucketUsage(env);
  if (usage.count >= maxObjects || usage.bytes + length > maxTotalBytes) {
    return json(
      { error: 'Der Speicher für geteilte Projekte ist zurzeit voll. Bitte später erneut versuchen oder eine kürzere Gültigkeit wählen.' },
      507
    );
  }

  const random = randomId(16);
  const id = `${days}-${random}`;
  const key = `${days}d/${random}`;
  const deleteToken = randomId(32);
  const deleteTokenHash = await sha256Hex(deleteToken);
  const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;

  // Magic-Bytes prüfen, ohne die ganze Datei in den Speicher zu laden: Anfang des
  // Streams lesen, prüfen und den Rest unverändert weiterreichen.
  const peeked = await peekStart(request.body, ZIP_MAGIC.length);
  if (!startsWith(peeked.head, ZIP_MAGIC)) {
    await peeked.cancel();
    return json({ error: 'Ungültiger Dateityp' }, 415);
  }

  await env.SHARES.put(key, peeked.stream(length), {
    // Bewusst neutral: der Inhaltstyp des Uploads wird verworfen, damit über
    // diesen Dienst niemals HTML o. Ä. ausgeliefert werden kann.
    httpMetadata: { contentType: 'application/octet-stream' },
    customMetadata: {
      kind,
      name,
      expiresAt: String(expiresAt),
      deleteTokenHash,
    },
  });

  const appUrl = (env.APP_URL || '').replace(/\/$/, '');
  return json({
    id,
    url: appUrl ? `${appUrl}/#/open/${id}` : null,
    deleteToken,
    expiresAt,
    kind,
    size: length,
  });
}

function keyForId(id) {
  const match = id.match(/^(\d+)-([A-Za-z0-9_-]+)$/);
  if (!match) return null;
  const days = Number(match[1]);
  if (!ALLOWED_DAYS.includes(days)) return null;
  return `${days}d/${match[2]}`;
}

async function handleDownload(id, env, headOnly) {
  const key = keyForId(id);
  if (!key) return json({ error: 'Nicht gefunden' }, 404);
  const object = headOnly ? await env.SHARES.head(key) : await env.SHARES.get(key);
  if (!object) return json({ error: 'Nicht gefunden' }, 404);

  const meta = object.customMetadata || {};
  const expiresAt = Number(meta.expiresAt || '0');
  if (expiresAt && Date.now() > expiresAt) {
    // Abgelaufen: sofort entfernen, falls die Lifecycle-Regel noch nicht gegriffen hat
    await env.SHARES.delete(key);
    return json({ error: 'Dieser Link ist abgelaufen' }, 410);
  }

  const headers = new Headers();
  // Immer neutral ausliefern: kein HTML-Hosting über diesen Dienst, kein MIME-Sniffing.
  // Die Web-App liest die Bytes per fetch()/XHR – Content-Disposition stört dabei nicht.
  headers.set('Content-Type', 'application/octet-stream');
  headers.set('Content-Disposition', contentDisposition(meta.name, meta.kind));
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Length', String(object.size));
  headers.set('X-Kind', meta.kind || 'book');
  headers.set('X-Name', encodeURIComponent(meta.name || ''));
  headers.set('X-Expires-At', String(expiresAt));
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Access-Control-Expose-Headers', 'X-Kind, X-Name, X-Expires-At, Content-Length');
  if (headOnly) return new Response(null, { status: 200, headers });
  return new Response(object.body, { status: 200, headers });
}

async function handleDelete(id, request, env) {
  const key = keyForId(id);
  if (!key) return json({ error: 'Nicht gefunden' }, 404);
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return json({ error: 'Kein Lösch-Schlüssel' }, 401);

  const object = await env.SHARES.head(key);
  if (!object) return new Response(null, { status: 204 });
  const expected = object.customMetadata?.deleteTokenHash || '';
  const actual = await sha256Hex(token);
  if (!expected || !timingSafeEqual(expected, actual)) {
    return json({ error: 'Lösch-Schlüssel ungültig' }, 403);
  }
  await env.SHARES.delete(key);
  return new Response(null, { status: 204 });
}

// --- Helfer -----------------------------------------------------------------

// Summe aller gespeicherten Dateien (Größe und Anzahl); abgelaufene Objekte, die die
// Lifecycle-Regel noch nicht entfernt hat, werden bei der Gelegenheit gelöscht.
async function bucketUsage(env) {
  let bytes = 0;
  let count = 0;
  let cursor;
  const now = Date.now();
  do {
    const page = await env.SHARES.list({ limit: 1000, cursor, include: ['customMetadata'] });
    for (const object of page.objects) {
      const expiresAt = Number(object.customMetadata?.expiresAt || '0');
      if (expiresAt && now > expiresAt) {
        await env.SHARES.delete(object.key);
        continue;
      }
      bytes += object.size;
      count += 1;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return { bytes, count };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function withCors(response, cors) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(cors)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  let allowed = '';
  if (env.ALLOWED_ORIGINS) {
    const list = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
    if (list.includes(origin)) allowed = origin;
  }
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Expires-Days, X-Kind, X-Name',
    'Access-Control-Expose-Headers': 'X-Kind, X-Name, X-Expires-At, Content-Length',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function randomId(length) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function safeName(name) {
  return String(name)
    .replace(/[\u0000-\u001F<>"'\\]/g, '')
    .slice(0, 120);
}

/** decodeURIComponent, das bei kaputter Prozentkodierung nicht wirft. */
function decodeUrlComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Dateiname für den Download (ASCII-Fallback + RFC 5987 für Umlaute). */
function contentDisposition(name, kind) {
  const extension = kind === 'canvas' ? 'lernspur' : 'epub';
  const base = (safeName(name || '').replace(/[/\\?%*:|"<>]/g, '_').trim()) || 'Lernspuren';
  const ascii = base.replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${ascii}.${extension}"; filename*=UTF-8''${encodeURIComponent(base)}.${extension}`;
}

/**
 * Erlaubte Herkunft, serverseitig geprüft (CORS allein schützt nur den Browser).
 * Ohne Origin/Referer wird abgelehnt – Web-App und iOS-Wrapper (`app://lernspuren`)
 * senden bei einem Cross-Origin-POST immer einen Origin-Header.
 */
function isAllowedOrigin(request, env) {
  const list = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) return false;

  const origin = request.headers.get('Origin');
  if (origin) return list.includes(origin);

  const referer = request.headers.get('Referer');
  if (referer) {
    if (list.some((entry) => referer === entry || referer.startsWith(`${entry}/`))) return true;
    try {
      return list.includes(new URL(referer).origin);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Rate-Limit über das Workers-Rate-Limiting-Binding (siehe wrangler.toml).
 * Fehlt das Binding (z. B. `wrangler dev` ohne Binding), wird nicht begrenzt.
 * Rückgabe: Response bei Überschreitung, sonst null.
 */
async function checkRateLimit(request, env) {
  const limiter = env.UPLOAD_LIMITER;
  if (!limiter || typeof limiter.limit !== 'function') return null;
  const key = request.headers.get('CF-Connecting-IP') || 'unbekannt';
  try {
    const { success } = await limiter.limit({ key });
    if (success) return null;
  } catch (error) {
    console.error('rate limit error', error);
    return null;
  }
  return json({ error: 'Zu viele Uploads. Bitte kurz warten und erneut versuchen.' }, 429);
}

/** Prüft, ob `bytes` mit der Signatur `magic` beginnt. */
function startsWith(bytes, magic) {
  if (!bytes || bytes.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (bytes[i] !== magic[i]) return false;
  }
  return true;
}

/**
 * Liest die ersten `count` Bytes eines Streams, ohne ihn zu verbrauchen:
 * `head` enthält den Anfang, `stream(length)` liefert den vollständigen Inhalt
 * (Anfang + Rest) als Stream bekannter Länge für R2 – so bleibt die Datei nie
 * komplett im Arbeitsspeicher.
 */
async function peekStart(body, count) {
  const reader = body.getReader();
  const chunks = [];
  let size = 0;
  while (size < count) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value && value.length) {
      chunks.push(value);
      size += value.length;
    }
  }
  const head = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    head.set(chunk, offset);
    offset += chunk.length;
  }

  return {
    head,
    cancel: () => reader.cancel().catch(() => undefined),
    stream(length) {
      // FixedLengthStream: R2 braucht die Gesamtlänge, wenn der Body neu zusammengesetzt wird.
      const { readable, writable } = new FixedLengthStream(length);
      const writer = writable.getWriter();
      void (async () => {
        try {
          for (const chunk of chunks) await writer.write(chunk);
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value && value.length) await writer.write(value);
          }
          await writer.close();
        } catch (error) {
          await writer.abort(error).catch(() => undefined);
        }
      })();
      return readable;
    },
  };
}
