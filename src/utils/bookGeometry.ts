// Geometrie-Helfer für den Buch-Modus (reine Funktionen, testbar ohne DOM)

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se';

export const MIN_ITEM_SIZE = 48;
// Mindestens so viele Seitenpunkte eines Items müssen sichtbar bleiben
export const PAGE_EDGE_KEEP = 40;
export const SNAP_THRESHOLD = 12;

/**
 * Skalierungsfaktor, mit dem eine Seite (Seitenkoordinaten) in den Viewport passt.
 */
export function fitPageScale(
  pageWidth: number,
  pageHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  padding = 0
): number {
  const availW = Math.max(1, viewportWidth - padding * 2);
  const availH = Math.max(1, viewportHeight - padding * 2);
  return Math.min(availW / pageWidth, availH / pageHeight);
}

/**
 * Hält ein Item so auf der Seite, dass es nie ganz verschwindet.
 */
export function clampToPage(rect: Rect, pageWidth: number, pageHeight: number): Rect {
  const keepX = Math.min(PAGE_EDGE_KEEP, rect.width);
  const keepY = Math.min(PAGE_EDGE_KEEP, rect.height);
  const minX = -rect.width + keepX;
  const maxX = pageWidth - keepX;
  const minY = -rect.height + keepY;
  const maxY = pageHeight - keepY;
  return {
    ...rect,
    x: Math.min(maxX, Math.max(minX, rect.x)),
    y: Math.min(maxY, Math.max(minY, rect.y)),
  };
}

/**
 * Magnetisches Einrasten an der Seitenmitte (horizontal und vertikal).
 * Liefert die eingerastete Position und welche Hilfslinien angezeigt werden sollen.
 */
export function snapToCenter(
  rect: Rect,
  pageWidth: number,
  pageHeight: number,
  threshold = SNAP_THRESHOLD
): { rect: Rect; snapX: boolean; snapY: boolean } {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const snapX = Math.abs(centerX - pageWidth / 2) <= threshold;
  const snapY = Math.abs(centerY - pageHeight / 2) <= threshold;
  return {
    rect: {
      ...rect,
      x: snapX ? pageWidth / 2 - rect.width / 2 : rect.x,
      y: snapY ? pageHeight / 2 - rect.height / 2 : rect.y,
    },
    snapX,
    snapY,
  };
}

/** Dreht einen Vektor um `deg` Grad (mathematisch positiv im Bildschirmkoordinatensystem). */
function rotateVector(vx: number, vy: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: vx * cos - vy * sin, y: vx * sin + vy * cos };
}

/**
 * Größe über einen Eckgriff ändern. dx/dy sind Verschiebungen in Seitenkoordinaten
 * (bereits in die gedrehte Lage des Items umgerechnet).
 * Bei keepAspect bleibt das Seitenverhältnis erhalten (Diagonale entscheidet).
 *
 * `rotation` (Grad) sorgt dafür, dass die gegenüberliegende Ecke auch bei gedrehten
 * Elementen auf dem Bildschirm stehen bleibt: Da CSS um den Mittelpunkt dreht,
 * verschiebt eine Größenänderung sonst den Ankerpunkt.
 */
export function resizeFromCorner(
  original: Rect,
  corner: Corner,
  dx: number,
  dy: number,
  keepAspect: boolean,
  rotation = 0,
  minSize = MIN_ITEM_SIZE
): Rect {
  const signX = corner === 'ne' || corner === 'se' ? 1 : -1;
  const signY = corner === 'sw' || corner === 'se' ? 1 : -1;

  let width = original.width + dx * signX;
  let height = original.height + dy * signY;

  if (keepAspect) {
    const aspect = original.width / original.height;
    // Die größere relative Änderung bestimmt die neue Größe
    const relW = width / original.width;
    const relH = height / original.height;
    if (Math.abs(relW - 1) >= Math.abs(relH - 1)) {
      height = width / aspect;
    } else {
      width = height * aspect;
    }
    if (width < minSize) {
      width = minSize;
      height = width / aspect;
    }
    if (height < minSize) {
      height = minSize;
      width = height * aspect;
    }
  } else {
    width = Math.max(minSize, width);
    height = Math.max(minSize, height);
  }

  // Gegenüberliegende Ecke bleibt fix (in der ungedrehten Lage)
  const x = signX === 1 ? original.x : original.x + original.width - width;
  const y = signY === 1 ? original.y : original.y + original.height - height;

  if (!rotation) return { x, y, width, height };

  // Der gedrehte Ankerpunkt soll fix bleiben. Verschiebung des Mittelpunkts d,
  // Korrektur = d - R(d) (hergeleitet aus Anker = Mitte + R(Anker - Mitte)).
  const dCenterX = original.x + original.width / 2 - (x + width / 2);
  const dCenterY = original.y + original.height / 2 - (y + height / 2);
  const rotated = rotateVector(dCenterX, dCenterY, rotation);

  return {
    x: x + dCenterX - rotated.x,
    y: y + dCenterY - rotated.y,
    width,
    height,
  };
}

/**
 * Winkel (Grad) vom Item-Mittelpunkt zu einem Punkt, 0° = nach oben.
 */
export function angleFromCenter(center: { x: number; y: number }, point: { x: number; y: number }): number {
  const rad = Math.atan2(point.x - center.x, -(point.y - center.y));
  let deg = (rad * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

/**
 * Rotation an 0/90/180/270 einrasten, wenn nah genug.
 */
export function snapRotation(deg: number, threshold = 6): number {
  const normalized = ((deg % 360) + 360) % 360;
  for (const target of [0, 90, 180, 270, 360]) {
    if (Math.abs(normalized - target) <= threshold) return target % 360;
  }
  return Math.round(normalized);
}

/**
 * Standardgröße eines neuen Items, passend zur Seite (max. 70 % der Seitenbreite).
 */
export function defaultItemRect(
  pageWidth: number,
  pageHeight: number,
  naturalWidth: number,
  naturalHeight: number,
  maxFraction = 0.7,
  offsetIndex = 0
): Rect {
  const maxW = pageWidth * maxFraction;
  const maxH = pageHeight * maxFraction;
  const scale = Math.min(1, maxW / naturalWidth, maxH / naturalHeight);
  const width = Math.round(naturalWidth * scale);
  const height = Math.round(naturalHeight * scale);
  // Gestaffelt platzieren, damit mehrere neue Items sich nicht exakt überdecken
  const offset = (offsetIndex % 6) * 24;
  const rect = {
    x: Math.round((pageWidth - width) / 2 + offset),
    y: Math.round((pageHeight - height) / 2 + offset),
    width,
    height,
  };
  return clampToPage(rect, pageWidth, pageHeight);
}
