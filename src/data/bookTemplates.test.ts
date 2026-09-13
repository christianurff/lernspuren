import { describe, expect, it } from 'vitest';
import { BOOK_TEMPLATES, buildBookTemplate } from './bookTemplates';
import { BOOK_FORMATS, type BookFormat } from '../types';

const FORMATE: BookFormat[] = ['portrait', 'square', 'landscape'];

describe('BOOK_TEMPLATES', () => {
  it('hat eindeutige Kennungen', () => {
    const ids = BOOK_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('beginnt jede Vorlage mit einem Deckblatt und hat weitere Seiten', () => {
    for (const template of BOOK_TEMPLATES) {
      expect(template.pages.length).toBeGreaterThan(1);
      expect(template.pages[0].texts[0].text.length).toBeGreaterThan(0);
    }
  });

  it('lässt auf jeder Seite Platz zum Füllen (leere Textfelder)', () => {
    for (const template of BOOK_TEMPLATES) {
      for (const page of template.pages) {
        expect(page.texts.some((text) => text.text === '')).toBe(true);
      }
    }
  });
});

describe('buildBookTemplate', () => {
  it('legt Seiten in Reihenfolge an und hängt die Elemente an ihre Seite', () => {
    const template = BOOK_TEMPLATES[0];
    const { pages, items } = buildBookTemplate(template, 'p1', 'portrait', { now: 1000 });

    expect(pages.map((p) => p.index)).toEqual(template.pages.map((_, i) => i));
    expect(pages.every((p) => p.projectId === 'p1')).toBe(true);
    expect(items).toHaveLength(template.pages.reduce((sum, p) => sum + p.texts.length, 0));

    const pageIds = new Set(pages.map((p) => p.id));
    expect(items.every((item) => pageIds.has(item.pageId))).toBe(true);
    expect(items.every((item) => item.createdAt === 1000)).toBe(true);
  });

  it('hält alle Elemente in jedem Seitenformat innerhalb der Seite', () => {
    for (const format of FORMATE) {
      const { width, height } = BOOK_FORMATS[format];
      for (const template of BOOK_TEMPLATES) {
        const { items } = buildBookTemplate(template, 'p1', format);
        for (const item of items) {
          expect(item.x).toBeGreaterThanOrEqual(0);
          expect(item.y).toBeGreaterThanOrEqual(0);
          expect(item.x + item.width).toBeLessThanOrEqual(width);
          expect(item.y + item.height).toBeLessThanOrEqual(height);
          expect(item.type === 'text' && item.fontSize > 0).toBe(true);
        }
      }
    }
  });

  it('übernimmt leere Felder als leeren Text (Platzhalter im Editor)', () => {
    const { items } = buildBookTemplate(BOOK_TEMPLATES[0], 'p1', 'portrait');
    const texts = items.filter((item) => item.type === 'text');
    expect(texts.some((item) => item.type === 'text' && item.text === '')).toBe(true);
  });

  it('setzt den Buchtitel auf das Deckblatt', () => {
    const { items } = buildBookTemplate(BOOK_TEMPLATES[0], 'p1', 'portrait', { title: 'Susis Buch' });
    const deckblatt = items[0];
    expect(deckblatt.type === 'text' && deckblatt.text).toBe('Susis Buch');
  });

  it('vergibt für jedes Element eine eigene Kennung', () => {
    const { pages, items } = buildBookTemplate(BOOK_TEMPLATES[1], 'p1', 'square');
    const ids = [...pages.map((p) => p.id), ...items.map((i) => i.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});
