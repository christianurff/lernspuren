/**
 * canvasRenderer – zeichnet ein Whiteboard verkleinert auf ein <canvas>.
 *
 * Gedacht für die Vorschau in der Projektübersicht: Statt „4 Karten" soll man
 * sehen, was auf der Fläche liegt. Anders als beim Konva-Export hängt das
 * Ergebnis nicht davon ab, wohin der Nutzer zuletzt gescrollt oder gezoomt hat —
 * gerendert wird immer alles, eingepasst in ein festes Kachelformat.
 *
 * Die Darstellung folgt der Karte auf dem Whiteboard (DocumentationCard), aber
 * bewusst vereinfacht: Bei einer 480 px breiten Kachel zählt der Gesamteindruck
 * — Bilder, Farben, Anordnung —, nicht die Lesbarkeit einzelner Wörter.
 */
import type { Card, Project, Zone } from '../types';
import type { Connection } from '../types';
import { theme, FONT_FAMILY } from '../theme';
import { cardDimensions } from '../utils/cardGeometry';

/** Kachelformat der Projektübersicht (die Kachel ist breiter als hoch). */
const THUMB_WIDTH = 480;
const THUMB_HEIGHT = 320;

/** Luft zwischen Inhalt und Kachelrand, als Anteil der kürzeren Kachelseite. */
const PADDING_RATIO = 0.06;

/** Kartenoptik wie auf dem Whiteboard. */
const CARD_RADIUS = 16;
const COMPACT_RADIUS = 12;
const ZONE_RADIUS = 20;

/** Grenzen für den Maßstab: sonst füllt eine einzelne Karte die ganze Kachel. */
const MAX_SCALE = 0.9;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundedRectPath(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  const limit = Math.max(0, Math.min(radius, r.width / 2, r.height / 2));
  ctx.beginPath();
  ctx.moveTo(r.x + limit, r.y);
  ctx.lineTo(r.x + r.width - limit, r.y);
  ctx.quadraticCurveTo(r.x + r.width, r.y, r.x + r.width, r.y + limit);
  ctx.lineTo(r.x + r.width, r.y + r.height - limit);
  ctx.quadraticCurveTo(r.x + r.width, r.y + r.height, r.x + r.width - limit, r.y + r.height);
  ctx.lineTo(r.x + limit, r.y + r.height);
  ctx.quadraticCurveTo(r.x, r.y + r.height, r.x, r.y + r.height - limit);
  ctx.lineTo(r.x, r.y + limit);
  ctx.quadraticCurveTo(r.x, r.y, r.x + limit, r.y);
  ctx.closePath();
}

/** Bild wie `object-fit: cover` einpassen (mittig beschnitten). */
function drawImageCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, r: Rect) {
  const quelle = img.naturalWidth / img.naturalHeight;
  const ziel = r.width / r.height;
  let sx = 0;
  let sy = 0;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  if (quelle > ziel) {
    sw = img.naturalHeight * ziel;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = img.naturalWidth / ziel;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, r.x, r.y, r.width, r.height);
}

/** Rechteck einer Karte in Weltkoordinaten (inkl. Stapelversatz). */
function cardRect(card: Card, freeLayout: boolean): Rect {
  const compact = card.isCompact ?? false;
  const { width, height } = cardDimensions(card, { freeLayout: freeLayout && !compact, compact });
  const versatz = (card.stackIndex ?? 0) * 4;
  return { x: card.position.x + versatz, y: card.position.y + versatz, width, height };
}

/** Umschließendes Rechteck aller Inhalte; `null`, wenn nichts da ist. */
function contentBounds(cards: Card[], zones: Zone[], project: Project, freeLayout: boolean): Rect | null {
  let links = Infinity;
  let oben = Infinity;
  let rechts = -Infinity;
  let unten = -Infinity;

  const dazu = (r: Rect) => {
    links = Math.min(links, r.x);
    oben = Math.min(oben, r.y);
    rechts = Math.max(rechts, r.x + r.width);
    unten = Math.max(unten, r.y + r.height);
  };

  for (const card of cards) dazu(cardRect(card, freeLayout));
  for (const zone of zones) {
    dazu({ x: zone.position.x, y: zone.position.y, width: zone.width, height: zone.height });
  }
  // Das Hintergrundbild (Vorlage) liegt ab (0,0) und gehört mit ins Bild
  if (project.backgroundImage && project.backgroundImageWidth && project.backgroundImageHeight) {
    dazu({ x: 0, y: 0, width: project.backgroundImageWidth, height: project.backgroundImageHeight });
  }

  if (!Number.isFinite(links) || rechts <= links || unten <= oben) return null;
  return { x: links, y: oben, width: rechts - links, height: unten - oben };
}

// --- Einzelne Karte ----------------------------------------------------------

function drawPlayTriangle(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.32 + size * 0.08, cy - size * 0.42);
  ctx.lineTo(cx + size * 0.42 + size * 0.08, cy);
  ctx.lineTo(cx - size * 0.32 + size * 0.08, cy + size * 0.42);
  ctx.closePath();
  ctx.fill();
}

function drawSpeaker(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const s = size / 2;
  ctx.fillStyle = theme.primaryBlue;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.7, cy - s * 0.35);
  ctx.lineTo(cx - s * 0.25, cy - s * 0.35);
  ctx.lineTo(cx + s * 0.2, cy - s * 0.8);
  ctx.lineTo(cx + s * 0.2, cy + s * 0.8);
  ctx.lineTo(cx - s * 0.25, cy + s * 0.35);
  ctx.lineTo(cx - s * 0.7, cy + s * 0.35);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = theme.primaryBlue;
  ctx.lineWidth = Math.max(1, size * 0.08);
  ctx.lineCap = 'round';
  for (const radius of [s * 0.55, s * 0.9]) {
    ctx.beginPath();
    ctx.arc(cx + s * 0.3, cy, radius, -Math.PI / 4, Math.PI / 4);
    ctx.stroke();
  }
}

/** Text zeilenweise im Rechteck; was nicht passt, entfällt. */
function drawText(ctx: CanvasRenderingContext2D, text: string, r: Rect, fontSize: number, color: string) {
  const sauber = text.trim();
  if (!sauber) return;
  ctx.save();
  roundedRectPath(ctx, r, 0);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.font = `${fontSize}px ${FONT_FAMILY}`;
  ctx.textBaseline = 'top';

  const zeilenhoehe = fontSize * 1.3;
  const maxBreite = r.width;
  let zeile = '';
  let y = r.y;

  const schreibe = () => {
    if (zeile) ctx.fillText(zeile, r.x, y);
    y += zeilenhoehe;
    zeile = '';
  };

  for (const wort of sauber.split(/\s+/)) {
    const versuch = zeile ? `${zeile} ${wort}` : wort;
    if (ctx.measureText(versuch).width > maxBreite && zeile) {
      schreibe();
      if (y > r.y + r.height) break;
      zeile = wort;
    } else {
      zeile = versuch;
    }
  }
  if (y <= r.y + r.height) schreibe();
  ctx.restore();
}

async function drawCard(ctx: CanvasRenderingContext2D, card: Card, freeLayout: boolean, weltProKachel: number) {
  const r = cardRect(card, freeLayout);
  if (r.width <= 0 || r.height <= 0) return;

  const compact = card.isCompact ?? false;
  // Im freien Modus liegen Foto, Video, Zeichnung und Text ohne Hülle auf der Fläche
  const bareContent = freeLayout && !compact && card.type !== 'task' && card.type !== 'audio';
  const radius = compact ? COMPACT_RADIUS : bareContent ? 0 : CARD_RADIUS;
  const frameColor = card.frameColor || '#FFFFFF';
  const isWhiteFrame = frameColor.toUpperCase() === '#FFFFFF';

  ctx.save();
  if (!bareContent) {
    roundedRectPath(ctx, r, radius);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
  }

  // Inhalt innerhalb der Kartenhülle
  ctx.save();
  roundedRectPath(ctx, r, radius);
  ctx.clip();

  switch (card.type) {
    case 'photo': {
      const img = await loadImage(card.thumbnailData || card.imageData);
      if (img) drawImageCover(ctx, img, r);
      if (card.annotationData) {
        const overlay = await loadImage(card.annotationData);
        if (overlay) ctx.drawImage(overlay, r.x, r.y, r.width, r.height);
      }
      break;
    }
    case 'drawing': {
      const img = await loadImage(card.imageData);
      if (img) ctx.drawImage(img, r.x, r.y, r.width, r.height);
      break;
    }
    case 'video': {
      const img = card.thumbnailData ? await loadImage(card.thumbnailData) : null;
      if (img) drawImageCover(ctx, img, r);
      else {
        ctx.fillStyle = '#374151';
        ctx.fillRect(r.x, r.y, r.width, r.height);
      }
      const kreis = Math.min(r.width, r.height) * 0.32;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.arc(r.x + r.width / 2, r.y + r.height / 2, kreis / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = theme.textPrimary;
      drawPlayTriangle(ctx, r.x + r.width / 2, r.y + r.height / 2, kreis * 0.5);
      break;
    }
    case 'audio': {
      ctx.fillStyle = '#EEF2FF';
      ctx.fillRect(r.x, r.y, r.width, r.height);
      drawSpeaker(ctx, r.x + r.width / 2, r.y + r.height / 2, Math.min(r.width, r.height) * 0.42);
      break;
    }
    case 'task': {
      ctx.fillStyle = '#FFF7ED';
      ctx.fillRect(r.x, r.y, r.width, r.height);
      const rand = Math.min(12, r.width * 0.08);
      drawText(
        ctx,
        card.taskText,
        { x: r.x + rand, y: r.y + rand, width: r.width - rand * 2, height: r.height - rand * 2 },
        Math.max(6 * weltProKachel, r.width * 0.09),
        theme.textPrimary
      );
      break;
    }
    default: {
      const rand = Math.min(12, r.width * 0.08);
      drawText(
        ctx,
        card.content,
        { x: r.x + rand, y: r.y + rand, width: r.width - rand * 2, height: r.height - rand * 2 },
        Math.max(6 * weltProKachel, r.width * 0.1),
        theme.textPrimary
      );
    }
  }
  ctx.restore();

  // Rahmen wie auf dem Whiteboard: Farbrahmen kräftig, Weiß nur als Haarlinie
  if (!bareContent) {
    ctx.strokeStyle = isWhiteFrame ? 'rgba(0,0,0,0.08)' : frameColor;
    ctx.lineWidth = isWhiteFrame ? 1 * weltProKachel : 3;
    roundedRectPath(ctx, r, radius);
    ctx.stroke();
  }
  ctx.restore();
}

// --- Gesamtbild --------------------------------------------------------------

export interface CanvasThumbnailInput {
  project: Project;
  cards: Card[];
  zones?: Zone[];
  connections?: Connection[];
}

/**
 * Rendert die Vorschau eines Whiteboards und gibt sie als JPEG-Data-URL zurück.
 * `null`, wenn nichts zu zeigen ist (leeres Projekt) — dann bleibt die Kachel
 * bei ihrer Platzhalter-Darstellung.
 */
export async function renderCanvasThumbnail(input: CanvasThumbnailInput): Promise<string | null> {
  const { project, cards, zones = [], connections = [] } = input;
  const sichtbar = cards.filter((c) => !c.isDeleted);
  if (sichtbar.length === 0 && zones.length === 0 && !project.backgroundImage) return null;

  const canvas = document.createElement('canvas');
  canvas.width = THUMB_WIDTH;
  canvas.height = THUMB_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = project.backgroundColor || '#FFFFFF';
  ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);

  const freeLayout = project.cardLayout === 'free';
  const bounds = contentBounds(sichtbar, zones, project, freeLayout);
  if (!bounds) return null;

  // Inhalt mittig einpassen (contain), damit die Kacheln gleichmäßig wirken
  const padding = Math.min(THUMB_WIDTH, THUMB_HEIGHT) * PADDING_RATIO;
  const scale = Math.min(
    MAX_SCALE,
    (THUMB_WIDTH - padding * 2) / bounds.width,
    (THUMB_HEIGHT - padding * 2) / bounds.height
  );
  const offsetX = (THUMB_WIDTH - bounds.width * scale) / 2 - bounds.x * scale;
  const offsetY = (THUMB_HEIGHT - bounds.height * scale) / 2 - bounds.y * scale;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  // Strichstärken sind in Kachelpixeln gedacht und dürfen nicht mitschrumpfen
  const weltProKachel = 1 / scale;

  // Hintergrundbild (Vorlage) – multiply, damit Weiß durchsichtig wirkt
  if (project.backgroundImage) {
    const img = await loadImage(project.backgroundImage);
    if (img) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(
        img,
        0,
        0,
        project.backgroundImageWidth ?? img.naturalWidth,
        project.backgroundImageHeight ?? img.naturalHeight
      );
      ctx.restore();
    }
  }

  // Bereiche liegen unter den Karten
  for (const zone of zones) {
    const r = { x: zone.position.x, y: zone.position.y, width: zone.width, height: zone.height };
    roundedRectPath(ctx, r, ZONE_RADIUS);
    ctx.fillStyle = zone.color;
    ctx.globalAlpha = 0.35;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = zone.color;
    ctx.lineWidth = 2 * weltProKachel;
    ctx.stroke();
  }

  // Verbindungen zwischen den Kartenmitten
  if (connections.length > 0) {
    const mitten = new Map<string, { x: number; y: number }>();
    for (const card of sichtbar) {
      const r = cardRect(card, freeLayout);
      mitten.set(card.id, { x: r.x + r.width / 2, y: r.y + r.height / 2 });
    }
    ctx.lineCap = 'round';
    for (const verbindung of connections) {
      const von = mitten.get(verbindung.sourceCardId);
      const nach = mitten.get(verbindung.targetCardId);
      if (!von || !nach) continue;
      ctx.strokeStyle = verbindung.color || 'rgba(30,58,95,0.45)';
      ctx.lineWidth = Math.max(verbindung.strokeWidth || 2, 2 * weltProKachel);
      ctx.beginPath();
      ctx.moveTo(von.x, von.y);
      ctx.lineTo(nach.x, nach.y);
      ctx.stroke();
    }
  }

  for (const card of [...sichtbar].sort((a, b) => a.zIndex - b.zIndex)) {
    await drawCard(ctx, card, freeLayout, weltProKachel);
  }

  ctx.restore();
  return canvas.toDataURL('image/jpeg', 0.8);
}
