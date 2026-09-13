/**
 * cardGeometry – einzige Wahrheit über die Maße einer Whiteboard-Karte.
 *
 * Ein Whiteboard hat zwei Darstellungsmodi (siehe `Project.cardLayout`):
 * quadratische Karten in drei Stufen (Standard, gut zum Sammeln und Sortieren)
 * oder freie Maße, die dem Inhalt folgen (gut für Collagen und Plakate). Damit
 * Karten, Verbindungen, Bereiche und die Anordnungs-Aktionen dieselben Zahlen
 * benutzen, rechnet niemand mehr selbst mit CARD_SIZES.
 */
import type { Card } from '../types';
import { CARD_SIZES } from '../types';
import { wrapText, type TextMeasurer } from '../services/bookRenderer';
import { FONT_FAMILY } from '../theme';

/** Kompakte Karte (Sammel-/Sortieransicht) – bleibt in beiden Modi quadratisch. */
export const COMPACT_SIZE = { width: 80, height: 80 };

/** Grenzen für frei gezogene Kanten. */
export const MIN_CARD_EDGE = 60;
export const MAX_CARD_EDGE = 1600;

/** Startbreite einer freien Textkarte. */
export const FREE_TEXT_WIDTH = 320;

/** Startmaße für Inhalte ohne eigenes Seitenverhältnis. */
const FREE_AUDIO_SIZE = { width: 240, height: 120 };
const FREE_TASK_SIZE = { width: 320, height: 240 };

/** Zeilenhöhe der Textdarstellung (identisch zum Konva-Text auf der Karte). */
const TEXT_LINE_HEIGHT = 1.3;

/** Auf ganze Punkte runden und in die erlaubten Grenzen zwingen. */
export function clampCardEdge(value: number): number {
  return Math.min(MAX_CARD_EDGE, Math.max(MIN_CARD_EDGE, Math.round(value)));
}

export interface CardDimensionOptions {
  freeLayout: boolean;
  compact: boolean;
}

/** Maße einer Karte in Weltkoordinaten. */
export function cardDimensions(card: Card, opts: CardDimensionOptions): { width: number; height: number } {
  if (opts.compact) return { ...COMPACT_SIZE };
  if (opts.freeLayout && card.freeSize) return { ...card.freeSize };
  const size = CARD_SIZES[card.size];
  return { width: size.width, height: size.height };
}

/**
 * Liegt der Inhalt ohne Kartenhülle auf der Fläche? Im freien Modus ist das bei
 * Foto, Video, Zeichnung und Text so; Audio braucht eine sichtbare Fläche,
 * Aufgabenkarten ihren Kasten.
 */
export function isBareContentCard(card: Card, opts: CardDimensionOptions): boolean {
  return opts.freeLayout && !opts.compact && card.type !== 'task' && card.type !== 'audio';
}

/**
 * Rechteck der Inline-Textbearbeitung in Weltkoordinaten. Randloser Text wird
 * bündig bearbeitet, sonst sitzt das Feld im Innenabstand der Karte. `origin`
 * ist die dargestellte Kartenecke (bei Stapeln inklusive Versatz).
 */
export function textEditRect(
  card: Card,
  origin: { x: number; y: number },
  opts: CardDimensionOptions
): { position: { x: number; y: number }; size: { width: number; height: number } } {
  const { width, height } = cardDimensions(card, opts);
  if (opts.compact) {
    return {
      position: { x: origin.x + 6, y: origin.y + 6 },
      size: { width: width - 12, height: height - 12 },
    };
  }
  const bare = isBareContentCard(card, opts);
  const inset = bare ? 0 : 8;
  return {
    position: { x: origin.x + inset, y: origin.y + (bare ? 0 : 12) },
    size: { width: width - inset * 2, height: height - (bare ? 0 : 24) },
  };
}

/** Schriftgröße einer freien Textkarte: Breite 200 entspricht der Stufe „Mittel". */
export function freeTextFontSize(width: number): number {
  return Math.min(64, Math.max(11, Math.round((width / 200) * 15)));
}

/**
 * Höhe eines Textblocks bei gegebener Breite. Ohne `measurer` wird über ein
 * Offscreen-Canvas gemessen; steht keins zur Verfügung (Tests, alte Browser),
 * greift eine Schätzung über die Zeichenzahl.
 */
export function measureTextHeight(
  text: string,
  width: number,
  fontSize: number,
  measurer: TextMeasurer = defaultMeasurer(fontSize)
): number {
  const lines = wrapText(measurer, text, Math.max(1, width));
  const lineCount = Math.max(1, lines.length);
  // Aufrunden, nicht runden: bei 2 Zeilen à 24 px sind es 62,4 px – abgerundet
  // auf 62 würde Konva die letzte Zeile nicht mehr zeichnen.
  return Math.ceil(lineCount * fontSize * TEXT_LINE_HEIGHT);
}

function defaultMeasurer(fontSize: number): TextMeasurer {
  const context = typeof document === 'undefined'
    ? null
    : document.createElement('canvas').getContext('2d');
  if (!context) {
    // Grobe Schätzung: ein Zeichen ist etwa halb so breit wie hoch
    return { measureText: (text: string) => ({ width: text.length * fontSize * 0.55 }) };
  }
  context.font = `${fontSize}px ${FONT_FAMILY}`;
  return context;
}

/**
 * Startmaße einer Karte im freien Modus. Die bisherige Kantenlänge wird zur
 * Breite, die Höhe folgt dem Seitenverhältnis des Mediums.
 */
export function naturalSize(
  card: Card,
  aspect: number | null,
  baseEdge: number
): { width: number; height: number } {
  switch (card.type) {
    case 'audio':
      return { ...FREE_AUDIO_SIZE };
    case 'task':
      return { ...FREE_TASK_SIZE };
    case 'text': {
      const width = FREE_TEXT_WIDTH;
      return { width, height: textHeightFor(card, width) };
    }
    default: {
      if (!aspect || !Number.isFinite(aspect) || aspect <= 0) {
        return { width: clampCardEdge(baseEdge), height: clampCardEdge(baseEdge) };
      }
      return { width: clampCardEdge(baseEdge), height: clampCardEdge(baseEdge / aspect) };
    }
  }
}

/**
 * Maße nach dem Ziehen am Eckgriff. Bilder behalten ihr Seitenverhältnis,
 * Text bekommt die zum Inhalt passende Höhe, Audio und Aufgaben sind frei.
 */
export function resizeFreeSize(
  card: Card,
  draggedWidth: number,
  draggedHeight: number,
  current: { width: number; height: number }
): { width: number; height: number } {
  const width = clampCardEdge(draggedWidth);

  if (card.type === 'text') {
    return { width, height: textHeightFor(card, width) };
  }
  if (card.type === 'audio' || card.type === 'task') {
    return { width, height: clampCardEdge(draggedHeight) };
  }

  const aspect = current.height > 0 ? current.width / current.height : 1;
  return { width, height: clampCardEdge(width / (aspect || 1)) };
}

/** Höhe einer Textkarte bei gegebener Breite (Schrift skaliert mit). */
function textHeightFor(card: Card, width: number): number {
  const content = card.type === 'text' ? card.content : '';
  return clampTextHeight(measureTextHeight(content, width, freeTextFontSize(width)));
}

/** Textkarten dürfen flacher als MIN_CARD_EDGE sein – eine Zeile genügt. */
function clampTextHeight(height: number): number {
  return Math.min(MAX_CARD_EDGE, Math.max(1, Math.ceil(height)));
}
