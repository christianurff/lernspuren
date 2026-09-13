import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import type { BookItem, BookPage, Project } from '../types';
import { setLanguageSetting } from '../i18n';

// Der Cover-Renderer braucht ein echtes <canvas>; in jsdom gibt es keins.
vi.mock('./bookRenderer', () => ({
  renderCoverThumbnail: vi.fn(async () => 'data:image/jpeg;base64,/9j/4AAQ'),
}));

const {
  BOOK_FILE_VERSION,
  buildBookManifest,
  buildEpub,
  escapeXml,
  extensionForMime,
  baseMimeType,
  mimeForPath,
  parseBookFile,
  renderPageXhtml,
} = await import('./bookFile');

// 1×1-PNG bzw. Mini-Audio als Data-URLs
const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const JPEG_THUMB = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const AUDIO = 'data:audio/mpeg;base64,SUQzBAAAAAAA';
const AAC = 'data:audio/aac;base64,//FQgAP//w==';
const WEBM_VIDEO = 'data:video/webm;codecs=vp9;base64,GkXfow==';

const project: Project = {
  id: 'p1',
  name: 'Mein <Buch> & mehr',
  backgroundColor: '#FFFFFF',
  kind: 'book',
  bookFormat: 'portrait',
  pageCount: 2,
  createdAt: 1,
  updatedAt: 2,
  cardCount: 0,
};

const pages: BookPage[] = [
  {
    id: 'page-a',
    projectId: 'p1',
    index: 0,
    backgroundColor: '#FFF8E7',
    backgroundPattern: 'lines',
    createdAt: 10,
    updatedAt: 11,
  },
  {
    id: 'page-b',
    projectId: 'p1',
    index: 1,
    backgroundColor: '#E3F0FF',
    backgroundPattern: 'dots',
    createdAt: 12,
    updatedAt: 13,
  },
];

const items: BookItem[] = [
  {
    id: 'i1',
    projectId: 'p1',
    pageId: 'page-a',
    type: 'text',
    x: 40,
    y: 60,
    width: 400,
    height: 120,
    rotation: 5,
    zIndex: 1,
    createdAt: 20,
    updatedAt: 21,
    text: 'Hallo <b>&"Welt"',
    fontSize: 32,
    fontFamily: 'rounded',
    color: '#1E3A5F',
    align: 'center',
    bold: true,
    backgroundColor: '#FFF3C4',
  },
  {
    id: 'i2',
    projectId: 'p1',
    pageId: 'page-a',
    type: 'image',
    x: 100,
    y: 300,
    width: 200,
    height: 200,
    rotation: 0,
    zIndex: 2,
    createdAt: 22,
    updatedAt: 23,
    imageData: PNG_1X1,
    thumbnailData: JPEG_THUMB,
    borderColor: '#5B8DEF',
    borderRadius: 12,
  },
  {
    id: 'i3',
    projectId: 'p1',
    pageId: 'page-b',
    type: 'audio',
    x: 10,
    y: 20,
    width: 300,
    height: 140,
    rotation: 0,
    zIndex: 1,
    createdAt: 24,
    updatedAt: 25,
    audioData: AUDIO,
    mimeType: 'audio/mpeg',
    label: 'Meine Aufnahme',
  },
  {
    id: 'i4',
    projectId: 'p1',
    pageId: 'page-b',
    type: 'audio',
    x: 10,
    y: 200,
    width: 300,
    height: 140,
    rotation: 0,
    zIndex: 2,
    createdAt: 26,
    updatedAt: 27,
    audioData: AAC,
    mimeType: 'audio/aac',
    label: 'AAC-Aufnahme',
  },
  {
    id: 'i5',
    projectId: 'p1',
    pageId: 'page-b',
    type: 'video',
    x: 10,
    y: 400,
    width: 320,
    height: 240,
    rotation: 0,
    zIndex: 3,
    createdAt: 28,
    updatedAt: 29,
    videoData: WEBM_VIDEO,
    mimeType: 'video/webm;codecs=vp9',
    duration: 12,
  },
];

/** Blob → Uint8Array (jsdom kennt Blob.arrayBuffer). */
async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

describe('Hilfsfunktionen', () => {
  it('maskiert XML-Sonderzeichen', () => {
    expect(escapeXml('a<b>&"c\'')).toBe('a&lt;b&gt;&amp;&quot;c&apos;');
  });

  it('bildet MIME-Typen auf Endungen ab und zurück', () => {
    expect(extensionForMime('image/jpeg')).toBe('jpg');
    expect(extensionForMime('audio/webm')).toBe('webm');
    expect(extensionForMime('irgendwas/unbekannt')).toBe('bin');
    expect(mimeForPath('media/item-1.jpg')).toBe('image/jpeg');
    expect(mimeForPath('media/item-1.mp3')).toBe('audio/mpeg');
  });

  it('kennt AAC und ignoriert Codec-Parameter', () => {
    expect(extensionForMime('audio/aac')).toBe('aac');
    expect(mimeForPath('media/item-4.aac')).toBe('audio/aac');
    expect(extensionForMime('video/webm;codecs=vp9')).toBe('webm');
    expect(baseMimeType('video/webm;codecs=vp9')).toBe('video/webm');
  });
});

describe('renderPageXhtml', () => {
  it('maskiert Text und schreibt den Viewport der Seitengröße', () => {
    const { manifest } = buildBookManifest(project, pages, items);
    const xhtml = renderPageXhtml(manifest.pages[0], 768, 1024);

    expect(xhtml).toContain('<meta name="viewport" content="width=768, height=1024"/>');
    expect(xhtml).toContain('Hallo &lt;b&gt;&amp;&quot;Welt&quot;');
    expect(xhtml).not.toContain('<b>');
  });
});

describe('EPUB-Export und -Import', () => {
  it('legt mimetype als ersten, unkomprimierten Eintrag ab', async () => {
    const blob = await buildEpub(project, pages, items);
    const bytes = await blobBytes(blob);

    // Lokaler Dateikopf: PK\x03\x04
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    // Kompressionsverfahren (Offset 8/9) = 0 → STORE
    expect(bytes[8]).toBe(0);
    expect(bytes[9]).toBe(0);
    // Dateiname direkt hinter dem 30 Byte langen Kopf
    const name = new TextDecoder().decode(bytes.subarray(30, 38));
    expect(name).toBe('mimetype');
  });

  it('enthält die EPUB-Grundstruktur', async () => {
    const blob = await buildEpub(project, pages, items);
    const zip = await JSZip.loadAsync(blob);

    expect(zip.file('META-INF/container.xml')).not.toBeNull();
    expect(zip.file('OEBPS/content.opf')).not.toBeNull();
    expect(zip.file('OEBPS/nav.xhtml')).not.toBeNull();
    expect(zip.file('OEBPS/page-001.xhtml')).not.toBeNull();
    expect(zip.file('OEBPS/page-002.xhtml')).not.toBeNull();
    expect(zip.file('OEBPS/dokumentenraum-book.json')).not.toBeNull();

    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('<meta property="rendition:layout">pre-paginated</meta>');
    expect(opf).toContain('properties="nav"');
    expect(opf).toContain('properties="cover-image"');
    expect(opf).toContain('<dc:title>Mein &lt;Buch&gt; &amp; mehr</dc:title>');
    expect(opf).toContain('<itemref idref="page-1"/>');
    expect(opf).toContain('<itemref idref="page-2"/>');
  });

  it('meldet den Fortschritt je Seite', async () => {
    const progress: Array<[number, number]> = [];
    await buildEpub(project, pages, items, (done, total) => progress.push([done, total]));
    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it('macht einen verlustfreien Round-Trip (Manifest und Medien)', async () => {
    const expected = buildBookManifest(project, pages, items);
    const blob = await buildEpub(project, pages, items);
    const { manifest, media } = await parseBookFile(blob);

    expect(manifest.format).toBe('dokumentenraum-book');
    expect(manifest.version).toBe(BOOK_FILE_VERSION);
    expect(manifest.project).toEqual({
      name: 'Mein <Buch> & mehr',
      bookFormat: 'portrait',
      backgroundColor: '#FFFFFF',
    });

    // Struktur, Texte und Positionen sind identisch
    expect(manifest.pages).toEqual(expected.manifest.pages);

    const [first, second] = manifest.pages;
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(3);

    const text = first.items[0];
    expect(text.type).toBe('text');
    if (text.type === 'text') {
      expect(text.text).toBe('Hallo <b>&"Welt"');
      expect(text.x).toBe(40);
      expect(text.y).toBe(60);
      expect(text.rotation).toBe(5);
    }

    // Medien kommen als identische Data-URLs zurück
    const image = first.items[1];
    expect(image.type).toBe('image');
    if (image.type === 'image') {
      expect(image.imageData).toBe('media/item-2.png');
      expect(await media(image.imageData)).toBe(PNG_1X1);
      expect(await media(image.thumbnailData!)).toBe(JPEG_THUMB);
    }

    const audio = second.items[0];
    expect(audio.type).toBe('audio');
    if (audio.type === 'audio') {
      expect(await media(audio.audioData)).toBe(AUDIO);
      expect(audio.label).toBe('Meine Aufnahme');
    }
  });

  it('macht AAC-Audio und Video mit Codec-Parameter verlustfrei mit', async () => {
    const blob = await buildEpub(project, pages, items);
    const { manifest, media } = await parseBookFile(blob);
    const second = manifest.pages[1];

    const aac = second.items[1];
    expect(aac.type).toBe('audio');
    if (aac.type === 'audio') {
      // Endung aus dem MIME-Typ, Daten identisch (MIME kommt aus dem Manifest)
      expect(aac.audioData.endsWith('.aac')).toBe(true);
      expect(await media(aac.audioData, aac.mimeType)).toBe(AAC);
    }

    const video = second.items[2];
    expect(video.type).toBe('video');
    if (video.type === 'video') {
      expect(video.mimeType).toBe('video/webm;codecs=vp9');
      expect(video.videoData.endsWith('.webm')).toBe(true);
      // Data-URL ohne Codec-Parameter, Nutzdaten unverändert
      expect(await media(video.videoData, video.mimeType)).toBe(
        'data:video/webm;base64,GkXfow=='
      );
    }
  });

  it('schreibt media-type im OPF ohne Codec-Parameter', async () => {
    const blob = await buildEpub(project, pages, items);
    const zip = await JSZip.loadAsync(blob);
    const opf = await zip.file('OEBPS/content.opf')!.async('string');

    expect(opf).toContain('media-type="video/webm"');
    expect(opf).not.toContain('codecs=vp9');
    expect(opf).toContain('media-type="audio/aac"');
  });

  it('lehnt eine ZIP ohne Manifest mit deutscher Meldung ab', async () => {
    setLanguageSetting('de');
    const zip = new JSZip();
    zip.file('irgendwas.txt', 'kein Buch');
    const blob = await zip.generateAsync({ type: 'blob' });

    await expect(parseBookFile(blob)).rejects.toThrow('Diese Datei ist kein Dokumentenraum-Buch');
    setLanguageSetting('auto');
  });

  it('lehnt eine Datei ab, die gar keine ZIP ist', async () => {
    setLanguageSetting('de');
    const blob = new Blob(['Hallo Welt'], { type: 'text/plain' });
    await expect(parseBookFile(blob)).rejects.toThrow('Diese Datei ist kein Dokumentenraum-Buch');
    setLanguageSetting('auto');
  });
});
