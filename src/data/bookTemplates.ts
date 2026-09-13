/**
 * Buchvorlagen für den Buch-Modus.
 *
 * Eine Vorlage ist ein Gerüst, kein fertiges Buch: Überschriften und Symbole
 * stehen schon da, darunter warten leere Textfelder („Tippe, um zu schreiben")
 * und freie Fläche für Fotos, Zeichnungen und Aufnahmen. Alles ist danach ganz
 * normal verschiebbar, veränderbar und löschbar — es entstehen echte Seiten und
 * Elemente, keine gesperrte Struktur.
 *
 * Leere Textfelder sind Absicht: Im Editor zeigen sie einen gestrichelten
 * Rahmen (siehe BookItemView), im Lesemodus und im Export sind sie unsichtbar.
 * Wer ein Feld nicht braucht, lässt es einfach leer.
 *
 * Maße stehen als Anteil der Seite (0…1), Schriftgrößen als Anteil der
 * Seitenbreite. So passt dieselbe Vorlage auf Hoch-, Quer- und Quadratformat.
 */
import { v4 as uuid } from 'uuid';
import type {
  BookFormat,
  BookItem,
  BookPage,
  BookPagePattern,
  BookTextAlign,
  BookTextItem,
} from '../types';
import { BOOK_FORMATS } from '../types';

const INK = '#1E3A5F';

export interface BookTemplateText {
  /** Leer = Platz zum Füllen (gestrichelter Rahmen im Editor). */
  text: string;
  x: number; // Anteile der Seitenbreite/-höhe
  y: number;
  width: number;
  height: number;
  size: number; // Anteil der Seitenbreite
  align?: BookTextAlign;
  bold?: boolean;
}

export interface BookTemplatePage {
  backgroundColor: string;
  pattern?: BookPagePattern;
  texts: BookTemplateText[];
}

export interface BookTemplate {
  id: string;
  name: string;
  description: string;
  format: BookFormat; // Vorschlag – im Dialog frei änderbar
  pages: BookTemplatePage[];
}

// --- Bausteine ------------------------------------------------------------

/** Titel auf dem Deckblatt. */
function title(text: string): BookTemplateText {
  return { text, x: 0.08, y: 0.16, width: 0.84, height: 0.14, size: 0.085, align: 'center', bold: true };
}

/** „von …" unter dem Titel: leer, wird selbst ausgefüllt. */
function author(): BookTemplateText {
  return { text: '', x: 0.2, y: 0.34, width: 0.6, height: 0.1, size: 0.045, align: 'center' };
}

/** Überschrift einer Inhaltsseite. */
function heading(text: string): BookTemplateText {
  return { text, x: 0.07, y: 0.06, width: 0.86, height: 0.1, size: 0.055, bold: true };
}

/** Schreibfeld unter der Überschrift; darunter bleibt Platz für Fotos. */
function writingBox(y = 0.18, height = 0.2): BookTemplateText {
  return { text: '', x: 0.07, y, width: 0.86, height, size: 0.04 };
}

/** Inhaltsseite: Überschrift oben, Schreibfeld darunter, Rest bleibt frei. */
function promptPage(backgroundColor: string, text: string): BookTemplatePage {
  return { backgroundColor, pattern: 'none', texts: [heading(text), writingBox()] };
}

const CREAM = '#FFF3C4';
const SKY = '#E3F0FF';
const MINT = '#E6F6EC';
const BLUSH = '#FFECEF';
const PAPER = '#FFFFFF';

// --- Vorlagen -------------------------------------------------------------

export const BOOK_TEMPLATES: BookTemplate[] = [
  {
    id: 'forscherbuch',
    name: 'Forscherbuch',
    description: 'Frage, Vermutung, Versuch, Beobachtung, Ergebnis',
    format: 'portrait',
    pages: [
      { backgroundColor: CREAM, pattern: 'none', texts: [title('Mein Forscherbuch'), author()] },
      promptPage(PAPER, '🔍 Meine Frage'),
      promptPage(SKY, '💡 Meine Vermutung'),
      promptPage(PAPER, '🧪 So habe ich es gemacht'),
      promptPage(MINT, '👀 Das habe ich beobachtet'),
      promptPage(CREAM, '⭐ Mein Ergebnis'),
    ],
  },
  {
    id: 'steckbrief',
    name: 'Steckbrief',
    description: 'Für ein Tier, eine Pflanze oder einen Menschen',
    format: 'portrait',
    pages: [
      { backgroundColor: SKY, pattern: 'none', texts: [title('Steckbrief'), author()] },
      promptPage(PAPER, '📷 So sieht es aus'),
      promptPage(MINT, '🏠 Wo lebt es?'),
      promptPage(PAPER, '🍽️ Was braucht es?'),
      promptPage(CREAM, '✨ Das ist besonders'),
    ],
  },
  {
    id: 'bildergeschichte',
    name: 'Bildergeschichte',
    description: 'Wer, wo, welches Problem – und wie es ausgeht',
    format: 'landscape',
    pages: [
      { backgroundColor: BLUSH, pattern: 'none', texts: [title('Meine Geschichte'), author()] },
      promptPage(PAPER, '👤 Wer? Wo?'),
      promptPage(PAPER, '❗ Das Problem'),
      promptPage(PAPER, '➡️ So ging es weiter'),
      promptPage(BLUSH, '🏁 Das Ende'),
    ],
  },
  {
    id: 'schritt-fuer-schritt',
    name: 'Schritt für Schritt',
    description: 'Rezept, Bastelanleitung oder Versuch erklären',
    format: 'portrait',
    pages: [
      { backgroundColor: MINT, pattern: 'none', texts: [title('Schritt für Schritt'), author()] },
      promptPage(PAPER, '🧰 Das brauche ich'),
      promptPage(PAPER, '1️⃣ Schritt eins'),
      promptPage(PAPER, '2️⃣ Schritt zwei'),
      promptPage(PAPER, '3️⃣ Schritt drei'),
      promptPage(MINT, '🎉 Fertig!'),
    ],
  },
  {
    id: 'woerterbuch',
    name: 'Mein Wörterbuch',
    description: 'Bild, Wort und Aufnahme – eine Seite pro Wort',
    format: 'square',
    pages: [
      { backgroundColor: SKY, pattern: 'none', texts: [title('Mein Wörterbuch'), author()] },
      wordPage(),
      wordPage(),
      wordPage(),
      wordPage(),
    ],
  },
  {
    id: 'lerntagebuch',
    name: 'Lerntagebuch',
    description: 'Gelernt, schwierig, stolz – für den Rückblick',
    format: 'portrait',
    pages: [
      { backgroundColor: CREAM, pattern: 'none', texts: [title('Mein Lerntagebuch'), author()] },
      promptPage(PAPER, '✅ Das habe ich gelernt'),
      promptPage(SKY, '🤔 Das war schwierig'),
      promptPage(CREAM, '⭐ Darauf bin ich stolz'),
    ],
  },
];

/**
 * Wörterbuchseite: oben das Wort (leer, groß), unten ein Satz dazu.
 * Dazwischen bleibt die Fläche für Bild und Sprachaufnahme frei.
 */
function wordPage(): BookTemplatePage {
  return {
    backgroundColor: PAPER,
    pattern: 'none',
    texts: [
      { text: '', x: 0.1, y: 0.07, width: 0.8, height: 0.13, size: 0.085, align: 'center', bold: true },
      { text: '', x: 0.1, y: 0.82, width: 0.8, height: 0.11, size: 0.04, align: 'center' },
    ],
  };
}

// --- Aufbau ---------------------------------------------------------------

/**
 * Baut aus einer Vorlage echte Seiten und Elemente für ein Projekt.
 * Reine Funktion: Der Aufrufer schreibt das Ergebnis in die Datenbank.
 * `title` ersetzt den Titel auf dem Deckblatt, damit Buchtitel und Deckblatt
 * dasselbe sagen.
 */
export function buildBookTemplate(
  template: BookTemplate,
  projectId: string,
  format: BookFormat,
  options: { title?: string; now?: number } = {}
): { pages: BookPage[]; items: BookItem[] } {
  const now = options.now ?? Date.now();
  const { width, height } = BOOK_FORMATS[format];
  const pages: BookPage[] = [];
  const items: BookItem[] = [];

  template.pages.forEach((templatePage, index) => {
    const page: BookPage = {
      id: uuid(),
      projectId,
      index,
      backgroundColor: templatePage.backgroundColor,
      backgroundPattern: templatePage.pattern ?? 'none',
      createdAt: now,
      updatedAt: now,
    };
    pages.push(page);

    templatePage.texts.forEach((text, textIndex) => {
      // Der Titel auf dem Deckblatt ist derselbe wie der Buchtitel
      const content = index === 0 && textIndex === 0 && options.title ? options.title : text.text;
      const item: BookTextItem = {
        id: uuid(),
        projectId,
        pageId: page.id,
        type: 'text',
        x: Math.round(text.x * width),
        y: Math.round(text.y * height),
        width: Math.round(text.width * width),
        height: Math.round(text.height * height),
        rotation: 0,
        zIndex: textIndex + 1,
        text: content,
        fontSize: Math.round(text.size * width),
        fontFamily: 'rounded',
        color: INK,
        align: text.align ?? 'left',
        bold: text.bold ?? false,
        createdAt: now,
        updatedAt: now,
      };
      items.push(item);
    });
  });

  return { pages, items };
}
