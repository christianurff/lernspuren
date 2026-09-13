// Erzeugt neue Buch-Elemente (ohne id/projectId/zIndex) mit sinnvoller Standardgröße und -position
import type { NewBookItem } from '../stores/useBookStore';
import { defaultItemRect } from '../utils/bookGeometry';
import type { BookCaption, Card } from '../types';

interface PageSize {
  width: number;
  height: number;
}

function imageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 800, height: img.naturalHeight || 600 });
    img.onerror = () => resolve({ width: 800, height: 600 });
    img.src = dataUrl;
  });
}

export function createTextItem(pageId: string, page: PageSize, text = '', offsetIndex = 0): NewBookItem {
  const width = Math.round(page.width * 0.7);
  const height = 120;
  const rect = defaultItemRect(page.width, page.height, width, height, 1, offsetIndex);
  return {
    type: 'text',
    pageId,
    ...rect,
    rotation: 0,
    text,
    fontSize: 32,
    fontFamily: 'rounded',
    color: '#1E3A5F',
    align: 'left',
    bold: false,
  };
}

export async function createImageItem(
  pageId: string,
  page: PageSize,
  imageData: string,
  thumbnailData?: string,
  offsetIndex = 0
): Promise<NewBookItem> {
  const dims = await imageDimensions(imageData);
  const rect = defaultItemRect(page.width, page.height, dims.width, dims.height, 0.75, offsetIndex);
  return { type: 'image', pageId, ...rect, rotation: 0, imageData, thumbnailData };
}

export function createVideoItem(
  pageId: string,
  page: PageSize,
  videoData: string,
  thumbnailData?: string,
  duration?: number,
  mimeType?: string,
  offsetIndex = 0,
  captions?: BookCaption[]
): NewBookItem {
  const rect = defaultItemRect(page.width, page.height, 640, 360, 0.75, offsetIndex);
  // Neue Videos laufen an ihrem Platz auf der Seite – das Buch bleibt dabei sichtbar.
  // Vollbild lässt sich im Inspektor weiterhin wählen.
  return {
    type: 'video',
    pageId,
    ...rect,
    rotation: 0,
    playback: 'inline',
    videoData,
    thumbnailData,
    duration,
    mimeType,
    captions,
  };
}

export function createAudioItem(
  pageId: string,
  page: PageSize,
  audioData: string,
  duration?: number,
  mimeType?: string,
  transcription?: string,
  offsetIndex = 0,
  captions?: BookCaption[]
): NewBookItem {
  const rect = defaultItemRect(page.width, page.height, 160, 160, 0.4, offsetIndex);
  return { type: 'audio', pageId, ...rect, rotation: 0, audioData, duration, mimeType, transcription, captions };
}

// Zeichnungen decken immer die ganze Seite ab
export function createDrawingItem(pageId: string, page: PageSize, imageData: string, drawingData: string): NewBookItem {
  return {
    type: 'drawing',
    pageId,
    x: 0,
    y: 0,
    width: page.width,
    height: page.height,
    rotation: 0,
    imageData,
    drawingData,
  };
}

// Whiteboard-Karte in ein Buch-Element kopieren (Aufgabenkarten werden nicht übernommen)
export async function createItemFromCard(pageId: string, page: PageSize, card: Card, offsetIndex = 0): Promise<NewBookItem | null> {
  switch (card.type) {
    case 'photo':
      return createImageItem(pageId, page, card.imageData, card.thumbnailData, offsetIndex);
    case 'text':
      return createTextItem(pageId, page, card.content, offsetIndex);
    case 'video':
      return createVideoItem(pageId, page, card.videoData, card.thumbnailData, card.duration, card.mimeType, offsetIndex);
    case 'audio':
      return createAudioItem(pageId, page, card.audioData, card.duration, card.mimeType, card.transcription, offsetIndex);
    case 'drawing': {
      // Zeichnungskarten werden als Bild eingefügt (skaliert, frei verschiebbar)
      const item = await createImageItem(pageId, page, card.imageData, undefined, offsetIndex);
      return item;
    }
    default:
      return null;
  }
}
