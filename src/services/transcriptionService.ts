// Sprache in einer fertigen Aufnahme erkennen.
//
// Im Browser gibt es dafür nichts: die Web Speech API hört nur am Mikrofon mit,
// eine fertige Datei kann sie nicht lesen. Live erkannt wird deshalb schon beim
// Aufnehmen (AddCardModal, BookMediaCapture) und beim Diktieren (AudioEditor).
// In der iOS-App erkennt `SFSpeechRecognizer` dagegen die fertige Datei — nur
// auf dem Gerät. Das ist der Weg für alles, was nachträglich kommt: Aufnahmen
// aus der Mediathek, Aufnahmen aus dem Browser und Versuche, die beim ersten
// Mal an der noch fehlenden Berechtigung gescheitert sind.
import type { BookCaption } from '../types';
import { speechLocale } from '../i18n';
import {
  isNativeSpeechAvailable,
  transcribeRecording,
  type NativeSpeechError,
} from '../utils/nativeBridge';

export type TranscriptionError = NativeSpeechError;

/** Ergebnis einer nachträglichen Erkennung – mit Grund, falls nichts kam. */
export interface TranscriptionResult {
  captions: BookCaption[] | null;
  error?: TranscriptionError;
}

/** Lässt sich eine fertige Aufnahme hier nachträglich erkennen? */
export function canTranscribeRecording(): boolean {
  return isNativeSpeechAvailable();
}

/**
 * Erkennt die Sprache in einer gespeicherten Aufnahme (Data-URL).
 * `captions: null`, wenn es hier nicht geht, die Sprache offline fehlt, die
 * Berechtigung verweigert wurde oder nichts zu verstehen war – der Grund steht
 * in `error` (fehlt er, war schlicht nichts zu verstehen).
 */
export async function transcribeMedia(
  dataUrl: string,
  mimeType?: string
): Promise<TranscriptionResult> {
  if (!canTranscribeRecording()) return { captions: null };
  try {
    const blob = await (await fetch(dataUrl)).blob();
    if (blob.size === 0) return { captions: null };
    const typ = mimeType || blob.type || undefined;
    const quelle = typ && typ !== blob.type ? new Blob([blob], { type: typ }) : blob;
    const { captions, error } = await transcribeRecording(quelle, speechLocale());
    return { captions: captions && captions.length > 0 ? captions : null, error };
  } catch {
    return { captions: null, error: 'other' };
  }
}

/** Untertitel zu einem fortlaufenden Text zusammenziehen. */
export function captionsToText(captions: BookCaption[]): string {
  return captions
    .map((c) => c.text.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}
