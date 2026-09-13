/**
 * bookExport – Export eines Buches als PDF (alle Seiten) bzw. einer Seite als PNG.
 * Nutzt den deterministischen `bookRenderer`; kein html2canvas, funktioniert offline.
 */
import { saveBlob, saveDataUrl } from '../utils/nativeBridge';
import type { BookItem, BookPage } from '../types';
import { renderPageDataUrl } from './bookRenderer';
import { t } from '../i18n';

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
  return cleaned.length > 0 ? cleaned : t('Buch');
}


/**
 * Berechnet das PDF-Seitenformat in mm: 210 mm Breite bei Hoch-/Quadratformat,
 * 297 mm Breite bei Querformat; Höhe proportional zum Seitenverhältnis.
 */
function pdfPageSize(pageWidth: number, pageHeight: number): {
  width: number;
  height: number;
  orientation: 'p' | 'l';
} {
  const isLandscape = pageWidth > pageHeight;
  const width = isLandscape ? 297 : 210;
  const height = (width * pageHeight) / pageWidth;
  return { width, height, orientation: isLandscape ? 'l' : 'p' };
}

/**
 * Exportiert das ganze Buch als PDF (eine PDF-Seite je Buchseite).
 * `onProgress` meldet den Fortschritt (fertige Seiten, Gesamtzahl).
 */
export async function exportBookPdf(
  projectName: string,
  pages: BookPage[],
  itemsByPage: (pageId: string) => BookItem[],
  pageWidth: number,
  pageHeight: number,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  if (pages.length === 0) return;

  const { width, height, orientation } = pdfPageSize(pageWidth, pageHeight);

  // jsPDF wird erst beim Export geladen (kleineres Start-Bundle)
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation, unit: 'mm', format: [width, height] });

  // Bei vielen Seiten grober rastern, damit der Speicher reicht
  const pixelRatio = pages.length > 20 ? 1.5 : 2;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    // Die Data-URL bleibt bewusst auf die Schleife begrenzt und wird nach dem
    // Einfügen wieder freigegeben – sonst hält der Export alle Seiten im Speicher.
    const dataUrl = await renderPageDataUrl(page, itemsByPage(page.id), pageWidth, pageHeight, {
      pixelRatio,
      type: 'image/jpeg',
      quality: 0.8,
    });

    if (i > 0) {
      pdf.addPage([width, height], orientation);
    }
    pdf.addImage(dataUrl, 'JPEG', 0, 0, width, height);
    onProgress?.(i + 1, pages.length);
  }

  await saveBlob(pdf.output('blob'), `${safeFileName(projectName)}_${formatDate(new Date())}.pdf`, 'application/pdf');
}

/** Exportiert eine einzelne Buchseite als PNG-Download. */
export async function exportPagePng(
  projectName: string,
  pageNumber: number,
  page: BookPage,
  items: BookItem[],
  pageWidth: number,
  pageHeight: number
): Promise<void> {
  const dataUrl = await renderPageDataUrl(page, items, pageWidth, pageHeight, {
    pixelRatio: 2,
    type: 'image/png',
  });
  await saveDataUrl(
    dataUrl,
    `${safeFileName(projectName)}_Seite-${pageNumber}_${formatDate(new Date())}.png`
  );
}
