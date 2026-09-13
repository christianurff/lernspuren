// Beispielinhalte (ein Buch, ein Whiteboard) – für den ersten Eindruck und die Store-Screenshots.
// Aufruf über die URL ?demo=1 (siehe App.tsx); legt nichts doppelt an (feste IDs).
import { v4 as uuid } from 'uuid';
import { bookService, cardService, projectService, zoneService } from './db/database';
import { createThumbnail } from '../utils/imageCompression';
import { renderCoverThumbnail } from './bookRenderer';
import { getLanguage } from '../i18n';
import type { BookItem, BookPage, BookTextItem, Card, Project, Zone } from '../types';
import { BOOK_FORMATS } from '../types';

export const DEMO_BOOK_ID = 'demo-buch-schnecke';
export const DEMO_CANVAS_ID = 'demo-whiteboard-pflanzen';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function loadDataUrl(path: string): Promise<string> {
  const response = await fetch(`${BASE}${path}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

interface DemoTexts {
  bookTitle: string;
  cover: string;
  p2: string;
  p3: string;
  canvasTitle: string;
  zoneA: string;
  zoneB: string;
  cardA: string;
  cardB: string;
  cardC: string;
}

const TEXTS: Record<'de' | 'en', DemoTexts> = {
  de: {
    bookTitle: 'Meine Schnecke Susi',
    cover: 'Meine Schnecke Susi',
    p2: 'Susi kriecht ganz langsam.\nIhr Haus trägt sie immer mit.',
    p3: 'Ich habe einen Turm gebaut.\nEr hat 4 Stockwerke!',
    canvasTitle: 'Pflanzen beobachten',
    zoneA: 'Was ich sehe',
    zoneB: 'Was ich vermute',
    cardA: 'Die Pflanze wird jeden Tag größer.',
    cardB: 'Am 10. Tag kommt eine Blüte.',
    cardC: 'Ohne Wasser wächst sie nicht.',
  },
  en: {
    bookTitle: 'My snail Susi',
    cover: 'My snail Susi',
    p2: 'Susi crawls very slowly.\nShe always carries her house.',
    p3: 'I built a tower.\nIt has 4 floors!',
    canvasTitle: 'Watching plants grow',
    zoneA: 'What I see',
    zoneB: 'What I think',
    cardA: 'The plant gets bigger every day.',
    cardB: 'On day 10 a flower appears.',
    cardC: 'Without water it does not grow.',
  },
};

function textItem(pageId: string, text: string, x: number, y: number, width: number, fontSize: number, bold = false, align: 'left' | 'center' = 'left'): Omit<BookTextItem, 'id' | 'projectId' | 'createdAt' | 'updatedAt'> {
  return { type: 'text', pageId, x, y, width, height: Math.round(fontSize * 1.25 * 3 + 24), rotation: 0, zIndex: 2, text, fontSize, fontFamily: 'rounded', color: '#1E3A5F', align, bold };
}

let seeding: Promise<void> | null = null;

/**
 * Legt die Demo-Inhalte an, falls sie fehlen. Gleichzeitige Aufrufe (z. B. der
 * doppelte Effekt-Lauf im React-StrictMode) teilen sich einen Durchlauf, sonst
 * kollidieren die festen IDs beim zweiten Einfügen.
 */
export function seedDemoContent(): Promise<void> {
  if (!seeding) {
    seeding = seedDemoContentOnce().finally(() => {
      seeding = null;
    });
  }
  return seeding;
}

async function seedDemoContentOnce(): Promise<void> {
  const lang = getLanguage();
  const texts = TEXTS[lang];
  const now = Date.now();

  if (!(await projectService.getById(DEMO_BOOK_ID))) {
    const { width, height } = BOOK_FORMATS.portrait;
    const [snail, tower] = await Promise.all([loadDataUrl('/demo/schnecke.png'), loadDataUrl('/demo/turm.png')]);
    const project: Project = {
      id: DEMO_BOOK_ID,
      name: texts.bookTitle,
      backgroundColor: '#FFFFFF',
      kind: 'book',
      bookFormat: 'portrait',
      pageCount: 3,
      createdAt: now,
      updatedAt: now,
      cardCount: 0,
    };
    await projectService.create(project);
    const pageIds = [uuid(), uuid(), uuid()];
    const pages: BookPage[] = [
      { id: pageIds[0], projectId: DEMO_BOOK_ID, index: 0, backgroundColor: '#FFF3C4', backgroundPattern: 'none', createdAt: now, updatedAt: now },
      { id: pageIds[1], projectId: DEMO_BOOK_ID, index: 1, backgroundColor: '#FFFFFF', backgroundPattern: 'lines', createdAt: now, updatedAt: now },
      { id: pageIds[2], projectId: DEMO_BOOK_ID, index: 2, backgroundColor: '#E3F0FF', backgroundPattern: 'none', createdAt: now, updatedAt: now },
    ];
    for (const page of pages) await bookService.createPage(page);
    const imgW = Math.round(width * 0.8);
    const imgH = Math.round(imgW * 0.75);
    const items = [
      { ...textItem(pageIds[0], texts.cover, 64, 90, width - 128, 64, true, 'center') },
      { type: 'image' as const, pageId: pageIds[0], x: Math.round((width - imgW) / 2), y: 330, width: imgW, height: imgH, rotation: -3, zIndex: 1, imageData: snail, borderRadius: 24 },
      { type: 'image' as const, pageId: pageIds[1], x: 64, y: 80, width: imgW, height: imgH, rotation: 0, zIndex: 1, imageData: snail, borderRadius: 24, borderColor: '#FFFFFF' },
      { ...textItem(pageIds[1], texts.p2, 64, 80 + imgH + 40, width - 128, 36) },
      { type: 'image' as const, pageId: pageIds[2], x: 96, y: 80, width: imgW - 64, height: Math.round((imgW - 64) * 0.75), rotation: 2, zIndex: 1, imageData: tower, borderRadius: 24 },
      { ...textItem(pageIds[2], texts.p3, 64, 80 + Math.round((imgW - 64) * 0.75) + 48, width - 128, 36) },
    ];
    const created = items.map(
      (item) => ({ ...item, id: uuid(), projectId: DEMO_BOOK_ID, createdAt: now, updatedAt: now }) as BookItem
    );
    await bookService.bulkCreateItems(created);
    try {
      const coverItems = created.filter((it) => it.pageId === pageIds[0]).sort((a, b) => a.zIndex - b.zIndex);
      const coverImage = await renderCoverThumbnail(pages[0], coverItems, width, height);
      await projectService.update(DEMO_BOOK_ID, { coverImage });
    } catch {
      // Cover ist optional
    }
  }

  if (!(await projectService.getById(DEMO_CANVAS_ID))) {
    const plant = await loadDataUrl(lang === 'de' ? '/demo/pflanze.png' : '/demo/pflanze-en.png');
    const thumb = await createThumbnail(plant);
    const project: Project = {
      id: DEMO_CANVAS_ID,
      name: texts.canvasTitle,
      backgroundColor: '#F0FFF4',
      kind: 'canvas',
      createdAt: now,
      updatedAt: now,
      cardCount: 0,
    };
    await projectService.create(project);
    const zones: Zone[] = [
      { id: uuid(), projectId: DEMO_CANVAS_ID, name: texts.zoneA, color: 'rgba(91,141,239,0.18)', position: { x: 60, y: 120 }, width: 520, height: 640, createdAt: now, updatedAt: now },
      { id: uuid(), projectId: DEMO_CANVAS_ID, name: texts.zoneB, color: 'rgba(255,143,171,0.18)', position: { x: 620, y: 120 }, width: 360, height: 640, createdAt: now, updatedAt: now },
    ];
    for (const zone of zones) await zoneService.create(zone);
    const cards: Card[] = [
      { id: uuid(), projectId: DEMO_CANVAS_ID, type: 'photo', size: 'large', position: { x: 100, y: 200 }, zIndex: 1, imageData: plant, thumbnailData: thumb, frameColor: '#B5EAD7', createdAt: now, updatedAt: now },
      { id: uuid(), projectId: DEMO_CANVAS_ID, type: 'text', size: 'medium', position: { x: 160, y: 520 }, zIndex: 2, content: texts.cardA, frameColor: '#FDFD96', createdAt: now, updatedAt: now },
      { id: uuid(), projectId: DEMO_CANVAS_ID, type: 'text', size: 'medium', position: { x: 700, y: 200 }, zIndex: 3, content: texts.cardB, frameColor: '#FFD1DC', createdAt: now, updatedAt: now },
      { id: uuid(), projectId: DEMO_CANVAS_ID, type: 'text', size: 'medium', position: { x: 700, y: 460 }, zIndex: 4, content: texts.cardC, frameColor: '#AEC6CF', createdAt: now, updatedAt: now },
    ];
    for (const card of cards) await cardService.create(card);
  }
}
