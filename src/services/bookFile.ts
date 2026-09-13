/**
 * bookFile – Export und Import eines Buches als EPUB 3 (Fixed Layout).
 *
 * Warum EPUB? Es ist ein offenes, verbreitetes Format: Die exportierte Datei
 * lässt sich in Apple Books & Co. lesen UND von Dokumentenraum verlustfrei
 * wieder importieren. Dafür liegt zusätzlich zu den XHTML-Seiten ein
 * maschinenlesbares Manifest (`OEBPS/dokumentenraum-book.json`) im Container,
 * das alle Seiten, Elemente und Positionen exakt beschreibt. Lesegeräte
 * ignorieren diese Datei, Dokumentenraum liest sie beim Import.
 *
 * Alles läuft lokal im Browser (JSZip), es gibt keinen Server.
 */
import { saveBlob } from '../utils/nativeBridge';
import { baseMimeType, parseDataUrl } from '../utils/mediaFormats';
import { v4 as uuid } from 'uuid';
import type {
  BookFormat,
  BookItem,
  BookPage,
  BookPagePattern,
  Project,
} from '../types';
import { BOOK_FONT_FAMILIES, BOOK_FORMATS } from '../types';
import { renderCoverThumbnail } from './bookRenderer';
import { bookService, projectService } from './db/database';
import { t } from '../i18n';

/** Version des Manifests im Container. Wird beim Import geprüft. */
export const BOOK_FILE_VERSION = 1;

/** Kennung, an der ein Dokumentenraum-Buch erkannt wird. */
export const BOOK_FILE_FORMAT = 'dokumentenraum-book';

/** Name der Manifest-Datei im EPUB-Container. */
const MANIFEST_NAME = 'dokumentenraum-book.json';

/** Ordner im Container, in dem alle Inhalte liegen. */
const OEBPS = 'OEBPS';

/** Abstand der Hintergrundmuster (wie BookPageView) */
const PATTERN_STEP = 48;
/** Farbe der Hintergrundmuster (wie BookPageView) */
const PATTERN_COLOR = 'rgba(30,58,95,0.12)';

// ---------------------------------------------------------------------------
// Manifest-Typen
// ---------------------------------------------------------------------------

/**
 * Ein Element wie im Buch, aber ohne Datenbank-IDs und mit Container-Pfaden
 * (z. B. `media/item-3.jpg`) statt Data-URLs in den Medienfeldern
 * `imageData`, `thumbnailData`, `videoData` und `audioData`.
 */
type WithoutIds<T> = T extends unknown ? Omit<T, 'id' | 'projectId' | 'pageId'> : never;

export type BookFileItem = WithoutIds<BookItem>;

/** Eine Seite ohne Datenbank-IDs, mit ihren Elementen. */
export type BookFilePage = Omit<BookPage, 'id' | 'projectId'> & {
  items: BookFileItem[];
};

/** Vollständige Beschreibung eines Buches im Container. */
export interface BookFileManifest {
  format: typeof BOOK_FILE_FORMAT;
  version: number;
  project: {
    name: string;
    bookFormat: BookFormat;
    backgroundColor: string;
  };
  pages: BookFilePage[];
  exportedAt: number;
}

/** Eine Mediendatei im Container. */
export interface BookFileMedia {
  path: string; // relativ zum OEBPS-Ordner, z. B. 'media/item-3.jpg'
  bytes: Uint8Array;
  mimeType: string;
}

// ---------------------------------------------------------------------------
// Kleine Helfer (bewusst rein, damit sie testbar sind)
// ---------------------------------------------------------------------------

/** Maskiert Zeichen, die in XML/XHTML Sonderbedeutung haben. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Datum als YYYY-MM-DD für Dateinamen */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Entfernt Zeichen, die in Dateinamen Probleme machen. */
function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim();
  return cleaned.length > 0 ? cleaned : 'Buch';
}

/** Bekannte MIME-Typen und ihre Dateiendungen. */
const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'video/webm': 'webm',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'audio/webm': 'webm',
  'audio/aac': 'aac',
  'audio/x-aac': 'aac',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'application/json': 'json',
  'application/xhtml+xml': 'xhtml',
};

/** Endungen zurück auf MIME-Typen (für den Import). */
const EXTENSION_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webm: 'video/webm',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  json: 'application/json',
  xhtml: 'application/xhtml+xml',
  bin: 'application/octet-stream',
};

/**
 * MIME-Typ ohne Codec-Parameter, z. B. `video/webm;codecs=vp9` → `video/webm`.
 * EPUB-Lesegeräte erwarten im OPF einen reinen `media-type`.
 */
export { baseMimeType };

/** Dateiendung zu einem MIME-Typ (unbekannt → `bin`). */
export function extensionForMime(mimeType: string): string {
  return MIME_TO_EXTENSION[baseMimeType(mimeType)] ?? 'bin';
}

/** MIME-Typ zu einer Dateiendung (unbekannt → application/octet-stream). */
export function mimeForPath(path: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(path);
  const ext = match ? match[1].toLowerCase() : '';
  return EXTENSION_TO_MIME[ext] ?? 'application/octet-stream';
}

/**
 * Wandelt eine Data-URL in Bytes um. Nicht-base64-URLs werden als Text gelesen.
 * Gibt `null` zurück, wenn der Wert keine Data-URL ist.
 */
export function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mimeType: string } | null {
  return parseDataUrl(dataUrl);
}

/** Wandelt Bytes zurück in eine Data-URL. */
export function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

/** CSS für das Hintergrundmuster einer Seite (wie BookPageView, Maßstab 1:1). */
export function patternCss(pattern: BookPagePattern | undefined): string {
  if (!pattern || pattern === 'none') return '';
  if (pattern === 'lines') {
    return `background-image:linear-gradient(to bottom, ${PATTERN_COLOR} 1px, transparent 1px);background-size:100% ${PATTERN_STEP}px;`;
  }
  if (pattern === 'grid') {
    return (
      `background-image:linear-gradient(to bottom, ${PATTERN_COLOR} 1px, transparent 1px),` +
      `linear-gradient(to right, ${PATTERN_COLOR} 1px, transparent 1px);` +
      `background-size:${PATTERN_STEP}px ${PATTERN_STEP}px;`
    );
  }
  return `background-image:radial-gradient(${PATTERN_COLOR} 2px, transparent 2px);background-size:${PATTERN_STEP}px ${PATTERN_STEP}px;`;
}

// ---------------------------------------------------------------------------
// Manifest bauen
// ---------------------------------------------------------------------------

/** Entfernt die Datenbank-IDs eines Elements. */
function stripIds<T extends BookItem>(item: T): Omit<T, 'id' | 'projectId' | 'pageId'> {
  const copy: Partial<T> = { ...item };
  delete copy.id;
  delete copy.projectId;
  delete copy.pageId;
  return copy as Omit<T, 'id' | 'projectId' | 'pageId'>;
}

/**
 * Baut Manifest und Medienliste aus Projekt, Seiten und Elementen.
 * Seiten werden nach `index`, Elemente je Seite nach `zIndex` sortiert.
 */
export function buildBookManifest(
  project: Pick<Project, 'name' | 'bookFormat' | 'backgroundColor'>,
  pages: BookPage[],
  items: BookItem[],
  now: number = Date.now()
): { manifest: BookFileManifest; media: BookFileMedia[] } {
  const media: BookFileMedia[] = [];
  let counter = 0;

  /** Legt eine Mediendatei an und liefert ihren Pfad zurück. */
  const store = (dataUrl: string | undefined, suffix: string): string | undefined => {
    if (!dataUrl) return undefined;
    const decoded = dataUrlToBytes(dataUrl);
    if (!decoded) return undefined;
    const path = `media/item-${counter}${suffix}.${extensionForMime(decoded.mimeType)}`;
    media.push({ path, bytes: decoded.bytes, mimeType: decoded.mimeType });
    return path;
  };

  const sortedPages = [...pages].sort((a, b) => a.index - b.index);

  const filePages: BookFilePage[] = sortedPages.map((page, pageIndex) => {
    const pageItems = items
      .filter((it) => it.pageId === page.id)
      .sort((a, b) => a.zIndex - b.zIndex);

    const fileItems: BookFileItem[] = pageItems.map((item): BookFileItem => {
      counter += 1;

      switch (item.type) {
        case 'image':
          return {
            ...stripIds(item),
            imageData: store(item.imageData, '') ?? '',
            thumbnailData: store(item.thumbnailData, '-thumb'),
          };
        case 'drawing':
          return { ...stripIds(item), imageData: store(item.imageData, '') ?? '' };
        case 'video':
          return {
            ...stripIds(item),
            videoData: store(item.videoData, '') ?? '',
            thumbnailData: store(item.thumbnailData, '-thumb'),
          };
        case 'audio':
          return { ...stripIds(item), audioData: store(item.audioData, '') ?? '' };
        default:
          return stripIds(item);
      }
    });

    return {
      index: pageIndex,
      backgroundColor: page.backgroundColor,
      backgroundPattern: page.backgroundPattern,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      items: fileItems,
    };
  });

  return {
    manifest: {
      format: BOOK_FILE_FORMAT,
      version: BOOK_FILE_VERSION,
      project: {
        name: project.name,
        bookFormat: project.bookFormat ?? 'portrait',
        backgroundColor: project.backgroundColor,
      },
      pages: filePages,
      exportedAt: now,
    },
    media,
  };
}

// ---------------------------------------------------------------------------
// XHTML-Seiten
// ---------------------------------------------------------------------------

/** Dateiname einer Seite im Container, z. B. `page-001.xhtml`. */
function pageFileName(index: number): string {
  return `page-${String(index + 1).padStart(3, '0')}.xhtml`;
}

/** Titel einer Seite fürs Inhaltsverzeichnis. */
function pageTitle(index: number): string {
  return index === 0 ? 'Titelseite' : `Seite ${index + 1}`;
}

/** Gemeinsame Positionierung eines Elements (ohne Inhalt). */
function itemFrameCss(item: BookFileItem): string {
  const rotation = item.rotation || 0;
  return (
    `position:absolute;left:${item.x}px;top:${item.y}px;` +
    `width:${item.width}px;height:${item.height}px;` +
    `z-index:${item.zIndex};` +
    (rotation ? `transform:rotate(${rotation}deg);` : '')
  );
}

/** HTML eines einzelnen Elements. */
function renderItemHtml(item: BookFileItem): string {
  const frame = escapeXml(itemFrameCss(item));

  switch (item.type) {
    case 'text': {
      const fontCss = BOOK_FONT_FAMILIES[item.fontFamily]?.css ?? BOOK_FONT_FAMILIES.rounded.css;
      const style =
        `width:100%;height:100%;box-sizing:border-box;padding:12px;` +
        `font:${item.bold ? 'bold ' : ''}${item.fontSize}px ${fontCss};` +
        `line-height:1.25;color:${item.color};text-align:${item.align};` +
        (item.backgroundColor ? `background-color:${item.backgroundColor};border-radius:12px;` : '') +
        `white-space:pre-wrap;word-break:break-word;overflow:hidden;`;
      return (
        `<div class="item" style="${frame}">` +
        `<div style="${escapeXml(style)}">${escapeXml(item.text ?? '')}</div>` +
        `</div>`
      );
    }

    case 'image': {
      const style =
        `display:block;width:100%;height:100%;object-fit:cover;` +
        `border-radius:${item.borderRadius ?? 0}px;` +
        (item.borderColor ? `border:6px solid ${item.borderColor};box-sizing:border-box;` : '');
      return (
        `<div class="item" style="${frame}">` +
        `<img src="${escapeXml(item.imageData)}" alt="" style="${escapeXml(style)}"/>` +
        `</div>`
      );
    }

    case 'drawing':
      return (
        `<div class="item" style="${frame}">` +
        `<img src="${escapeXml(item.imageData)}" alt="" style="display:block;width:100%;height:100%;"/>` +
        `</div>`
      );

    case 'video': {
      const poster = item.thumbnailData ? ` poster="${escapeXml(item.thumbnailData)}"` : '';
      // Beschnitt als Media-Fragment (#t=start,ende) mitgeben: Lesegeräte, die
      // das unterstützen, spielen dann nur den gewählten Ausschnitt.
      const start = item.trimStart && item.trimStart > 0 ? item.trimStart : 0;
      const end = item.trimEnd && item.trimEnd > start ? item.trimEnd : undefined;
      const fragment = start > 0 || end !== undefined ? `#t=${start}${end !== undefined ? `,${end}` : ''}` : '';
      return (
        `<div class="item" style="${frame}">` +
        `<video controls="controls" playsinline="playsinline"${poster} src="${escapeXml(item.videoData + fragment)}" ` +
        `style="display:block;width:100%;height:100%;object-fit:cover;border-radius:12px;background-color:#374151;"></video>` +
        `</div>`
      );
    }

    case 'audio': {
      const label = item.label
        ? `<div style="font-size:20px;color:#1E3A5F;text-align:center;overflow:hidden;">${escapeXml(item.label)}</div>`
        : '';
      const tile =
        `width:100%;height:100%;box-sizing:border-box;border-radius:20px;background-color:#EEF2FF;` +
        `display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:12px;`;
      const icon =
        `<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#5B8DEF" stroke-width="2" ` +
        `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
        `<path d="M11 5 6 9H3v6h3l5 4V5z" fill="#5B8DEF" stroke="#5B8DEF"/>` +
        `<path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>`;
      return (
        `<div class="item" style="${frame}">` +
        `<div style="${escapeXml(tile)}">${icon}${label}` +
        `<audio controls="controls" src="${escapeXml(item.audioData)}" style="width:100%;"></audio>` +
        `</div></div>`
      );
    }
  }
}

/** Komplette XHTML-Datei einer Seite. */
export function renderPageXhtml(
  page: BookFilePage,
  pageWidth: number,
  pageHeight: number
): string {
  const body = page.items.map(renderItemHtml).join('');
  const pageStyle =
    `position:relative;width:${pageWidth}px;height:${pageHeight}px;overflow:hidden;` +
    `background-color:${page.backgroundColor || '#FFFFFF'};` +
    patternCss(page.backgroundPattern);

  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="de" xml:lang="de">
<head>
<meta charset="utf-8"/>
<title>${escapeXml(pageTitle(page.index))}</title>
<meta name="viewport" content="width=${pageWidth}, height=${pageHeight}"/>
<style>
html,body{margin:0;padding:0;}
.item{position:absolute;}
</style>
</head>
<body>
<div class="page" style="${escapeXml(pageStyle)}">${body}</div>
</body>
</html>`;
}

/** Inhaltsverzeichnis (EPUB-3-Navigation). */
function renderNavXhtml(bookTitle: string, pageCount: number): string {
  const entries = Array.from({ length: pageCount }, (_, i) =>
    `<li><a href="${pageFileName(i)}">${escapeXml(pageTitle(i))}</a></li>`
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="de" xml:lang="de">
<head>
<meta charset="utf-8"/>
<title>${escapeXml(bookTitle)}</title>
</head>
<body>
<nav epub:type="toc" id="toc">
<h1>Inhalt</h1>
<ol>
${entries}
</ol>
</nav>
</body>
</html>`;
}

/** container.xml (zeigt auf das OPF-Paket). */
function renderContainerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles>
<rootfile full-path="${OEBPS}/content.opf" media-type="application/oebps-package+xml"/>
</rootfiles>
</container>`;
}

/** Zeitstempel im von EPUB geforderten Format. */
function isoSeconds(date: Date): string {
  return `${date.toISOString().split('.')[0]}Z`;
}

/** Eintrag im OPF-Manifest. */
interface OpfEntry {
  id: string;
  href: string;
  mediaType: string;
  properties?: string;
}

/** content.opf mit Metadaten, Manifest und Spine. */
function renderContentOpf(
  bookTitle: string,
  identifier: string,
  modified: Date,
  entries: OpfEntry[],
  spineIds: string[]
): string {
  const manifestXml = entries
    .map(
      (entry) =>
        `<item id="${escapeXml(entry.id)}" href="${escapeXml(entry.href)}" media-type="${escapeXml(entry.mediaType)}"` +
        (entry.properties ? ` properties="${escapeXml(entry.properties)}"` : '') +
        `/>`
    )
    .join('\n');

  const spineXml = spineIds.map((id) => `<itemref idref="${escapeXml(id)}"/>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="de">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">${escapeXml(identifier)}</dc:identifier>
<dc:title>${escapeXml(bookTitle)}</dc:title>
<dc:language>de</dc:language>
<meta property="dcterms:modified">${isoSeconds(modified)}</meta>
<meta property="rendition:layout">pre-paginated</meta>
<meta property="rendition:orientation">auto</meta>
<meta property="rendition:spread">auto</meta>
</metadata>
<manifest>
${manifestXml}
</manifest>
<spine>
${spineXml}
</spine>
</package>`;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Baut ein gültiges EPUB 3 (Fixed Layout) mit allen Seiten, Medien und dem
 * Dokumentenraum-Manifest für den späteren Import.
 */
export async function buildEpub(
  project: Project,
  pages: BookPage[],
  items: BookItem[],
  onProgress?: (done: number, total: number) => void
): Promise<Blob> {
  const format = project.bookFormat ?? 'portrait';
  const { width: pageWidth, height: pageHeight } = BOOK_FORMATS[format];

  const { manifest, media } = buildBookManifest(project, pages, items);
  const bookTitle = project.name || 'Buch';

  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  // mimetype MUSS der erste Eintrag und unkomprimiert sein (EPIB-OCF-Regel)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', renderContainerXml());

  const entries: OpfEntry[] = [
    { id: 'nav', href: 'nav.xhtml', mediaType: 'application/xhtml+xml', properties: 'nav' },
  ];
  const spineIds: string[] = [];

  // Seiten
  const total = manifest.pages.length;
  manifest.pages.forEach((page, i) => {
    const href = pageFileName(i);
    const id = `page-${i + 1}`;
    zip.file(`${OEBPS}/${href}`, renderPageXhtml(page, pageWidth, pageHeight));
    entries.push({ id, href, mediaType: 'application/xhtml+xml' });
    spineIds.push(id);
    onProgress?.(i + 1, total);
  });

  zip.file(`${OEBPS}/nav.xhtml`, renderNavXhtml(bookTitle, total));

  // Medien
  media.forEach((file, i) => {
    zip.file(`${OEBPS}/${file.path}`, file.bytes);
    entries.push({ id: `media-${i + 1}`, href: file.path, mediaType: baseMimeType(file.mimeType) });
  });

  // Cover (aus Seite 1 gerendert). Ohne Canvas (z. B. in Tests) einfach weglassen.
  const firstPage = [...pages].sort((a, b) => a.index - b.index)[0];
  if (firstPage) {
    try {
      const coverUrl = await renderCoverThumbnail(
        firstPage,
        items.filter((it) => it.pageId === firstPage.id),
        pageWidth,
        pageHeight
      );
      const decoded = dataUrlToBytes(coverUrl);
      if (decoded) {
        zip.file(`${OEBPS}/cover.jpg`, decoded.bytes);
        entries.push({
          id: 'cover-image',
          href: 'cover.jpg',
          mediaType: 'image/jpeg',
          properties: 'cover-image',
        });
      }
    } catch (error) {
      console.warn('Cover konnte nicht gerendert werden:', error);
    }
  }

  // Manifest für den Re-Import
  zip.file(`${OEBPS}/${MANIFEST_NAME}`, JSON.stringify(manifest, null, 2));
  entries.push({ id: 'dokumentenraum-manifest', href: MANIFEST_NAME, mediaType: 'application/json' });

  zip.file(
    `${OEBPS}/content.opf`,
    renderContentOpf(bookTitle, `urn:uuid:${uuid()}`, new Date(), entries, spineIds)
  );

  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
}


/** Exportiert das Buch als EPUB-Datei (Download). */
export async function exportBookEpub(
  project: Project,
  pages: BookPage[],
  items: BookItem[],
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const blob = await buildEpub(project, pages, items, onProgress);
  await saveBlob(blob, `${safeFileName(project.name)}_${formatDate(new Date())}.epub`);
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** Fehlermeldung, wenn die Datei kein Dokumentenraum-Buch ist. */
function notABookError(): Error {
  return new Error(t('Diese Datei ist kein Dokumentenraum-Buch'));
}

/** Prüft, ob ein unbekannter Wert die Manifest-Form hat. */
function isBookFileManifest(value: unknown): value is BookFileManifest {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<BookFileManifest>;
  return (
    candidate.format === BOOK_FILE_FORMAT &&
    typeof candidate.version === 'number' &&
    Array.isArray(candidate.pages) &&
    typeof candidate.project === 'object' &&
    candidate.project !== null
  );
}

/**
 * Öffnet eine Buch-Datei (EPUB) und liefert das Manifest sowie einen Zugriff
 * auf die enthaltenen Medien als Data-URL.
 */
export async function parseBookFile(
  file: Blob | ArrayBuffer
): Promise<{ manifest: BookFileManifest; media: (path: string, mimeType?: string) => Promise<string> }> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(file).catch(() => {
    throw notABookError();
  });

  // Bevorzugt der Standardort, sonst irgendein Manifest im Container
  const manifestEntry =
    zip.file(`${OEBPS}/${MANIFEST_NAME}`) ??
    zip.file(new RegExp(`(^|/)${MANIFEST_NAME}$`))[0] ??
    null;

  if (!manifestEntry) throw notABookError();

  let parsed: unknown;
  try {
    parsed = JSON.parse(await manifestEntry.async('string'));
  } catch {
    throw notABookError();
  }

  if (!isBookFileManifest(parsed)) throw notABookError();
  if (parsed.version > BOOK_FILE_VERSION) {
    throw new Error(t('Diese Datei wurde mit einer neueren Version erstellt'));
  }

  // Medienpfade sind relativ zum Ordner, in dem das Manifest liegt
  const baseDir = manifestEntry.name.slice(0, manifestEntry.name.lastIndexOf('/') + 1);

  // Der im Manifest gespeicherte MIME-Typ ist genauer als die Dateiendung
  // (z. B. `audio/aac`, oder Typen, für die es keine eigene Endung gibt).
  const media = async (path: string, mimeType?: string): Promise<string> => {
    const entry = zip.file(`${baseDir}${path}`) ?? zip.file(path);
    if (!entry) throw new Error(t('Datei fehlt im Buch: {path}', { path }));
    const bytes = await entry.async('uint8array');
    return bytesToDataUrl(bytes, mimeType ? baseMimeType(mimeType) : mimeForPath(path));
  };

  return { manifest: parsed, media };
}

/** Löst einen Medienpfad auf; bei Problemen bleibt das Feld leer. */
async function resolveMedia(
  media: (path: string, mimeType?: string) => Promise<string>,
  path: string | undefined,
  mimeType?: string
): Promise<string | undefined> {
  if (!path) return undefined;
  try {
    return await media(path, mimeType);
  } catch (error) {
    console.warn('Medium konnte nicht gelesen werden:', path, error);
    return undefined;
  }
}

/** Baut aus einem Manifest-Element wieder ein Buch-Element mit Data-URLs. */
async function itemFromManifest(
  fileItem: BookFileItem,
  projectId: string,
  pageId: string,
  media: (path: string, mimeType?: string) => Promise<string>
): Promise<BookItem> {
  const ids = { id: uuid(), projectId, pageId };

  switch (fileItem.type) {
    case 'image':
      return {
        ...fileItem,
        ...ids,
        imageData: (await resolveMedia(media, fileItem.imageData)) ?? '',
        thumbnailData: await resolveMedia(media, fileItem.thumbnailData),
      };
    case 'drawing':
      return {
        ...fileItem,
        ...ids,
        imageData: (await resolveMedia(media, fileItem.imageData)) ?? '',
      };
    case 'video':
      return {
        ...fileItem,
        ...ids,
        videoData: (await resolveMedia(media, fileItem.videoData, fileItem.mimeType)) ?? '',
        thumbnailData: await resolveMedia(media, fileItem.thumbnailData),
      };
    case 'audio':
      return {
        ...fileItem,
        ...ids,
        audioData: (await resolveMedia(media, fileItem.audioData, fileItem.mimeType)) ?? '',
      };
    default:
      return { ...fileItem, ...ids };
  }
}

/**
 * Importiert eine Buch-Datei als neues Projekt (`kind: 'book'`).
 * Alle IDs werden neu vergeben, Medien landen wieder als Data-URLs in der DB.
 */
export async function importBookFile(
  file: Blob,
  options?: { name?: string }
): Promise<Project> {
  const { manifest, media } = await parseBookFile(file);

  const now = Date.now();
  const project: Project = {
    id: uuid(),
    name: options?.name ?? manifest.project.name ?? 'Buch',
    backgroundColor: manifest.project.backgroundColor ?? '#FFFFFF',
    kind: 'book',
    bookFormat: manifest.project.bookFormat ?? 'portrait',
    pageCount: manifest.pages.length,
    createdAt: now,
    updatedAt: now,
    cardCount: 0,
  };
  await projectService.create(project);

  const sortedPages = [...manifest.pages].sort((a, b) => a.index - b.index);
  const createdPages: BookPage[] = [];
  const createdItems: BookItem[] = [];

  for (let i = 0; i < sortedPages.length; i++) {
    const filePage = sortedPages[i];
    const page: BookPage = {
      id: uuid(),
      projectId: project.id,
      index: i,
      backgroundColor: filePage.backgroundColor || '#FFFFFF',
      backgroundPattern: filePage.backgroundPattern,
      createdAt: now,
      updatedAt: now,
    };
    await bookService.createPage(page);
    createdPages.push(page);

    const pageItems: BookItem[] = [];
    for (const fileItem of filePage.items) {
      pageItems.push(await itemFromManifest(fileItem, project.id, page.id, media));
    }
    if (pageItems.length > 0) {
      await bookService.bulkCreateItems(pageItems);
      createdItems.push(...pageItems);
    }
  }

  // Cover aus Seite 1 rendern (scheitert z. B. ohne Canvas – dann ohne Cover)
  const firstPage = createdPages[0];
  if (firstPage) {
    try {
      const { width, height } = BOOK_FORMATS[project.bookFormat ?? 'portrait'];
      const coverImage = await renderCoverThumbnail(
        firstPage,
        createdItems.filter((it) => it.pageId === firstPage.id),
        width,
        height
      );
      await projectService.update(project.id, { coverImage });
      project.coverImage = coverImage;
    } catch (error) {
      console.warn('Cover konnte nicht erzeugt werden:', error);
    }
  }

  return project;
}
