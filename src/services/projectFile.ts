/**
 * projectFile – gemeinsamer Einstieg für den Datei-Import.
 *
 * Bücher (`.epub`) und Whiteboards (`.lernspur`) sind beides ZIP-Container mit
 * einem Dokumentenraum-Manifest. Hier wird nur geschaut, welches Manifest
 * drinsteckt, und dann an den passenden Importer weitergereicht.
 */
import type JSZip from 'jszip';
import type { Project } from '../types';
import { importBookFile } from './bookFile';
import { CANVAS_MANIFEST_NAME, MAX_IMPORT_FILE_BYTES, importCanvasFile } from './canvasFile';
import { t } from '../i18n';

/** Name der Manifest-Datei eines Buches (liegt im EPUB unter OEBPS/). */
const BOOK_MANIFEST_NAME = 'dokumentenraum-book.json';

/** Fehlermeldung, wenn die Datei zu keinem bekannten Format passt. */
function unknownFormatError(): Error {
  return new Error(t('Unbekanntes Dateiformat'));
}

/** Sucht eine Manifest-Datei irgendwo im Container. */
function hasManifest(zip: JSZip, name: string): boolean {
  if (zip.file(name)) return true;
  return zip.file(new RegExp(`(^|/)${name.replace(/\./g, '\\.')}$`)).length > 0;
}

/**
 * Importiert eine Dokumentenraum-Datei (Buch oder Whiteboard) als neues
 * Projekt. Das Format wird am Manifest im Container erkannt.
 */
export async function importAnyFile(file: Blob): Promise<Project> {
  // Fremde Dateien nicht ungeprüft entpacken (die eigentlichen Grenzen für
  // Karten und Medien zieht danach der jeweilige Importer).
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error(t('Diese Datei ist zu groß zum Öffnen'));
  }

  // JSZip erst hier laden – der Import ist ein seltener Sonderfall.
  const JSZipCtor = (await import('jszip')).default;
  let zip: JSZip;
  try {
    zip = await JSZipCtor.loadAsync(file);
  } catch {
    throw unknownFormatError();
  }

  if (hasManifest(zip, BOOK_MANIFEST_NAME)) return importBookFile(file);
  if (hasManifest(zip, CANVAS_MANIFEST_NAME)) return importCanvasFile(file);

  throw unknownFormatError();
}
