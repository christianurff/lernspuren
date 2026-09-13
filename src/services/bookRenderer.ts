/**
 * bookRenderer – zeichnet eine Buchseite deterministisch auf ein <canvas>.
 *
 * Wird genutzt für Cover-Vorschau, PNG-Export und PDF-Export. Alle Koordinaten
 * der Items sind Seitenpunkte (siehe BOOK_FORMATS); der Renderer skaliert die
 * gesamte Zeichnung einmalig mit `pixelRatio`, damit die Ausgabe scharf ist.
 *
 * Annahmen (damit die DOM-Ansicht dazu passt):
 * - Bilder/Video-Vorschaubilder werden wie `object-fit: cover` eingepasst
 *   (mittig beschnitten, Seitenverhältnis bleibt erhalten).
 * - Zeichnungen (transparente PNGs) werden 1:1 in ihr Rechteck gestreckt.
 * - Text wird oben ausgerichtet, mit 12 Punkt Innenabstand und einer
 *   Zeilenhöhe von 1.25 × fontSize; überstehender Text wird am Rechteck
 *   abgeschnitten (clip).
 */
import type { BookItem, BookPage } from '../types';
import { BOOK_FONT_FAMILIES } from '../types';

/** Abstand der Hintergrundmuster in Seitenpunkten */
const PATTERN_SPACING = 48;
/** Farbe der Hintergrundmuster */
const PATTERN_COLOR = 'rgba(30, 58, 95, 0.12)';
/** Innenabstand von Text-Items in Seitenpunkten */
const TEXT_PADDING = 12;
/** Zeilenhöhe als Faktor der Schriftgröße */
const LINE_HEIGHT_FACTOR = 1.25;
/** Rahmenbreite von Bild-Items in Seitenpunkten */
const IMAGE_BORDER_WIDTH = 6;
/** Eckenradius der Audio-Fläche */
const AUDIO_RADIUS = 16;

/** Minimal typisierter Mess-Kontext – erlaubt einen Fake in Tests. */
export interface TextMeasurer {
  measureText(text: string): { width: number };
}

/**
 * Bricht `text` so um, dass keine Zeile breiter als `maxWidth` wird.
 *
 * Regeln:
 * - Explizite Zeilenumbrüche (`\n`) bleiben erhalten, auch leere Zeilen.
 * - Umbruch bevorzugt an Leerzeichen.
 * - Wörter, die allein zu breit sind, werden hart (zeichenweise) getrennt.
 * - Leerer Text ergibt `['']` (genau eine leere Zeile).
 */
export function wrapText(ctx: TextMeasurer, text: string, maxWidth: number): string[] {
  const lines: string[] = [];

  for (const paragraph of text.split('\n')) {
    if (paragraph.length === 0) {
      lines.push('');
      continue;
    }

    const words = paragraph.split(' ');
    let current = '';

    const pushHardBroken = (word: string) => {
      // Wort ist allein zu breit: zeichenweise auffüllen
      let chunk = '';
      for (const char of word) {
        const next = chunk + char;
        if (chunk.length > 0 && ctx.measureText(next).width > maxWidth) {
          lines.push(chunk);
          chunk = char;
        } else {
          chunk = next;
        }
      }
      current = chunk;
    };

    for (const word of words) {
      const candidate = current.length > 0 ? `${current} ${word}` : word;
      if (current.length > 0 && ctx.measureText(candidate).width > maxWidth) {
        lines.push(current);
        current = '';
        if (ctx.measureText(word).width > maxWidth) {
          pushHardBroken(word);
        } else {
          current = word;
        }
      } else if (current.length === 0 && ctx.measureText(word).width > maxWidth) {
        pushHardBroken(word);
      } else {
        current = candidate;
      }
    }

    lines.push(current);
  }

  return lines;
}

/** Lädt eine Data-URL als Bild. Fehler werden als abgelehntes Promise gemeldet. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
    img.src = src;
  });
}

/** Lädt ein Bild, gibt bei Fehlern `null` zurück (Item wird dann übersprungen). */
async function loadImageSafe(src: string | undefined): Promise<HTMLImageElement | null> {
  if (!src) return null;
  try {
    return await loadImage(src);
  } catch {
    return null;
  }
}

/** Pfad für ein abgerundetes Rechteck (ohne Abhängigkeit von ctx.roundRect). */
function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/** Zeichnet ein Bild wie `object-fit: cover` in das Rechteck (mittig beschnitten). */
function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const sourceWidth = img.naturalWidth || img.width;
  const sourceHeight = img.naturalHeight || img.height;
  if (!sourceWidth || !sourceHeight || width <= 0 || height <= 0) return;

  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  const cropX = (sourceWidth - cropWidth) / 2;
  const cropY = (sourceHeight - cropHeight) / 2;

  ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, x, y, width, height);
}

/** Hintergrundmuster der Seite */
function drawPattern(
  ctx: CanvasRenderingContext2D,
  pattern: BookPage['backgroundPattern'],
  pageWidth: number,
  pageHeight: number
): void {
  if (!pattern || pattern === 'none') return;

  ctx.save();
  if (pattern === 'dots') {
    ctx.fillStyle = PATTERN_COLOR;
    for (let y = PATTERN_SPACING; y < pageHeight; y += PATTERN_SPACING) {
      for (let x = PATTERN_SPACING; x < pageWidth; x += PATTERN_SPACING) {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    ctx.strokeStyle = PATTERN_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = PATTERN_SPACING; y < pageHeight; y += PATTERN_SPACING) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(pageWidth, y + 0.5);
    }
    if (pattern === 'grid') {
      for (let x = PATTERN_SPACING; x < pageWidth; x += PATTERN_SPACING) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, pageHeight);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Play-Symbol (weißer Kreis + Dreieck) mittig über der Videofläche */
function drawPlayBadge(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();

  const triangle = radius * 0.5;
  ctx.fillStyle = '#1E3A5F';
  ctx.beginPath();
  ctx.moveTo(centerX - triangle * 0.6 + radius * 0.08, centerY - triangle);
  ctx.lineTo(centerX + triangle + radius * 0.08, centerY);
  ctx.lineTo(centerX - triangle * 0.6 + radius * 0.08, centerY + triangle);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Lautsprecher-Symbol: Trapez + zwei Schallbögen */
function drawSpeakerIcon(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  size: number
): void {
  const unit = size / 2;
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.fillStyle = '#5B8DEF';
  ctx.strokeStyle = '#5B8DEF';
  ctx.lineWidth = Math.max(2, unit * 0.14);
  ctx.lineCap = 'round';

  // Korpus: kleines Rechteck + Trapez
  ctx.beginPath();
  ctx.moveTo(-unit * 0.9, -unit * 0.32);
  ctx.lineTo(-unit * 0.45, -unit * 0.32);
  ctx.lineTo(-unit * 0.02, -unit * 0.75);
  ctx.lineTo(-unit * 0.02, unit * 0.75);
  ctx.lineTo(-unit * 0.45, unit * 0.32);
  ctx.lineTo(-unit * 0.9, unit * 0.32);
  ctx.closePath();
  ctx.fill();

  // Schallbögen
  ctx.beginPath();
  ctx.arc(-unit * 0.02, 0, unit * 0.5, -Math.PI / 3, Math.PI / 3);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-unit * 0.02, 0, unit * 0.85, -Math.PI / 3, Math.PI / 3);
  ctx.stroke();
  ctx.restore();
}

async function drawItem(
  ctx: CanvasRenderingContext2D,
  item: BookItem
): Promise<void> {
  const { x, y, width, height } = item;
  if (width <= 0 || height <= 0) return;

  ctx.save();
  // Rotation um den Item-Mittelpunkt
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  ctx.translate(centerX, centerY);
  ctx.rotate(((item.rotation || 0) * Math.PI) / 180);
  ctx.translate(-centerX, -centerY);

  switch (item.type) {
    case 'image': {
      const img = await loadImageSafe(item.imageData);
      if (img) {
        const radius = item.borderRadius ?? 0;
        ctx.save();
        if (radius > 0) {
          roundedRectPath(ctx, x, y, width, height, radius);
          ctx.clip();
        }
        drawImageCover(ctx, img, x, y, width, height);
        ctx.restore();

        if (item.borderColor) {
          ctx.strokeStyle = item.borderColor;
          ctx.lineWidth = IMAGE_BORDER_WIDTH;
          if (radius > 0) {
            roundedRectPath(
              ctx,
              x + IMAGE_BORDER_WIDTH / 2,
              y + IMAGE_BORDER_WIDTH / 2,
              width - IMAGE_BORDER_WIDTH,
              height - IMAGE_BORDER_WIDTH,
              radius
            );
            ctx.stroke();
          } else {
            ctx.strokeRect(
              x + IMAGE_BORDER_WIDTH / 2,
              y + IMAGE_BORDER_WIDTH / 2,
              width - IMAGE_BORDER_WIDTH,
              height - IMAGE_BORDER_WIDTH
            );
          }
        }
      }
      break;
    }

    case 'drawing': {
      const img = await loadImageSafe(item.imageData);
      if (img) {
        ctx.drawImage(img, x, y, width, height);
      }
      break;
    }

    case 'video': {
      const thumb = await loadImageSafe(item.thumbnailData);
      ctx.save();
      if (thumb) {
        drawImageCover(ctx, thumb, x, y, width, height);
      } else {
        ctx.fillStyle = '#374151';
        ctx.fillRect(x, y, width, height);
      }
      ctx.restore();
      drawPlayBadge(ctx, x + width / 2, y + height / 2, Math.min(width, height) * 0.12);
      break;
    }

    case 'audio': {
      roundedRectPath(ctx, x, y, width, height, AUDIO_RADIUS);
      ctx.fillStyle = '#EEF2FF';
      ctx.fill();

      const hasLabel = Boolean(item.label);
      const iconSize = Math.min(width, height) * (hasLabel ? 0.42 : 0.5);
      const iconCenterY = hasLabel ? y + height / 2 - height * 0.12 : y + height / 2;
      drawSpeakerIcon(ctx, x + width / 2, iconCenterY, iconSize);

      if (item.label) {
        ctx.save();
        roundedRectPath(ctx, x, y, width, height, AUDIO_RADIUS);
        ctx.clip();
        ctx.fillStyle = '#1E3A5F';
        ctx.font = `22px ${BOOK_FONT_FAMILIES.rounded.css}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(item.label, x + width / 2, iconCenterY + iconSize / 2 + 12, width - 16);
        ctx.restore();
      }
      break;
    }

    case 'text': {
      if (item.backgroundColor) {
        roundedRectPath(ctx, x, y, width, height, 12);
        ctx.fillStyle = item.backgroundColor;
        ctx.fill();
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, width, height);
      ctx.clip();

      const fontCss = BOOK_FONT_FAMILIES[item.fontFamily]?.css ?? BOOK_FONT_FAMILIES.rounded.css;
      ctx.font = `${item.bold ? 'bold ' : ''}${item.fontSize}px ${fontCss}`;
      ctx.fillStyle = item.color;
      ctx.textBaseline = 'top';
      ctx.textAlign = item.align;

      const maxWidth = Math.max(1, width - TEXT_PADDING * 2);
      const lines = wrapText(ctx, item.text ?? '', maxWidth);
      const lineHeight = item.fontSize * LINE_HEIGHT_FACTOR;

      let textX = x + TEXT_PADDING;
      if (item.align === 'center') textX = x + width / 2;
      else if (item.align === 'right') textX = x + width - TEXT_PADDING;

      lines.forEach((line, i) => {
        ctx.fillText(line, textX, y + TEXT_PADDING + i * lineHeight);
      });
      ctx.restore();
      break;
    }
  }

  ctx.restore();
}

/**
 * Rendert eine Buchseite auf ein neues Canvas-Element.
 * Canvas-Größe = Seitengröße × pixelRatio (Standard 2).
 */
export async function renderPageToCanvas(
  page: BookPage,
  items: BookItem[],
  pageWidth: number,
  pageHeight: number,
  options?: { pixelRatio?: number }
): Promise<HTMLCanvasElement> {
  const pixelRatio = options?.pixelRatio ?? 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(pageWidth * pixelRatio);
  canvas.height = Math.round(pageHeight * pixelRatio);

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.scale(pixelRatio, pixelRatio);

  // Hintergrund
  ctx.fillStyle = page.backgroundColor || '#FFFFFF';
  ctx.fillRect(0, 0, pageWidth, pageHeight);
  drawPattern(ctx, page.backgroundPattern, pageWidth, pageHeight);

  // Items nach zIndex aufsteigend
  const sorted = [...items].sort((a, b) => a.zIndex - b.zIndex);
  for (const item of sorted) {
    await drawItem(ctx, item);
  }

  return canvas;
}

/** Rendert eine Seite und gibt sie als Data-URL zurück. */
export async function renderPageDataUrl(
  page: BookPage,
  items: BookItem[],
  pageWidth: number,
  pageHeight: number,
  options?: { pixelRatio?: number; type?: 'image/png' | 'image/jpeg'; quality?: number }
): Promise<string> {
  const canvas = await renderPageToCanvas(page, items, pageWidth, pageHeight, {
    pixelRatio: options?.pixelRatio,
  });
  return canvas.toDataURL(options?.type ?? 'image/png', options?.quality);
}

/** Cover-Vorschau: JPEG, längste Seite 480 px. */
export async function renderCoverThumbnail(
  page: BookPage,
  items: BookItem[],
  pageWidth: number,
  pageHeight: number
): Promise<string> {
  const longestSide = Math.max(pageWidth, pageHeight);
  const pixelRatio = longestSide > 0 ? 480 / longestSide : 1;
  return renderPageDataUrl(page, items, pageWidth, pageHeight, {
    pixelRatio,
    type: 'image/jpeg',
    quality: 0.8,
  });
}
