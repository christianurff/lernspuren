// Brücke zum nativen iOS-Wrapper (separates Xcode-Projekt, nicht Teil dieses Repos). Im Browser verhält sich alles wie gewohnt.
import type { BookCaption } from '../types';
import { baseMimeType } from './mediaFormats';

interface NativeMessageHandler {
  postMessage: (message: unknown) => void;
}

/** Antwort der nativen Spracherkennung auf eine fertige Aufnahme. */
interface NativeSpeechFileResult {
  requestId: string;
  segments?: BookCaption[];
  error?: string;
}

/** Antwort des nativen Videoschnitts (die Daten kommen vorher in Stücken). */
interface NativeVideoTrimResult {
  requestId: string;
  mime?: string;
  duration?: number;
  /** Nur beim Abbruch gesetzt: "cancelled" | "unsupported" | "failed" | "busy". */
  reason?: string;
}

interface NativeWindow extends Window {
  __nativeApp?: 'ios';
  __nativeAppVersion?: number;
  webkit?: { messageHandlers?: Record<string, NativeMessageHandler | undefined> };
  /** Teilstück einer großen Base64-Antwort (evaluateJavaScript verträgt keine 30 MB am Stück). */
  __nativeChunk?: (requestId: string, part: string) => void;
  __nativeSpeechFileResult?: (result: NativeSpeechFileResult) => void;
  __nativeVideoTrimResult?: (result: NativeVideoTrimResult) => void;
  __nativeVideoTrimCancel?: (result: { requestId: string; reason?: string }) => void;
}

function nativeWindow(): NativeWindow | undefined {
  return typeof window === 'undefined' ? undefined : (window as NativeWindow);
}

/** Läuft die Web-App im nativen iOS-Wrapper? */
export function isNativeApp(): boolean {
  return nativeWindow()?.__nativeApp === 'ios';
}

function handler(name: string): NativeMessageHandler | undefined {
  return nativeWindow()?.webkit?.messageHandlers?.[name];
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Datei konnte nicht gelesen werden'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Datei speichern: im Browser als Download, in der iOS-App über das Teilen-Blatt
 * (`<a download>` funktioniert in WKWebView nicht).
 */
export async function saveBlob(blob: Blob, fileName: string, mime?: string): Promise<void> {
  const download = handler('download');
  if (isNativeApp() && download) {
    const base64 = await blobToBase64(blob);
    download.postMessage({ filename: fileName, mime: mime ?? blob.type ?? 'application/octet-stream', base64 });
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Data-URL (z. B. PNG aus Canvas) speichern, siehe saveBlob. */
export async function saveDataUrl(dataUrl: string, fileName: string): Promise<void> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  await saveBlob(blob, fileName, blob.type);
}

// --- Anfrage/Antwort mit der nativen Seite -----------------------------------
//
// Die App antwortet über globale Rückruffunktionen (`window.__native…`), weil
// WKScriptMessage keine Rückgabewerte kennt. Jede Anfrage bekommt eine ID;
// große Antworten (geschnittene Videos) kommen vorher in 1-MB-Stücken über
// `window.__nativeChunk` an.

const offeneAnfragen = new Map<string, (value: unknown) => void>();
const empfangeneStuecke = new Map<string, string[]>();
let rueckrufeInstalliert = false;

function neueAnfrageId(): string {
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function beantworte(requestId: string, value: unknown) {
  const resolve = offeneAnfragen.get(requestId);
  if (!resolve) {
    empfangeneStuecke.delete(requestId);
    return;
  }
  offeneAnfragen.delete(requestId);
  resolve(value);
}

function installiereRueckrufe() {
  const w = nativeWindow();
  if (!w || rueckrufeInstalliert) return;
  rueckrufeInstalliert = true;
  w.__nativeChunk = (requestId, part) => {
    const liste = empfangeneStuecke.get(requestId);
    if (liste) liste.push(part);
    else empfangeneStuecke.set(requestId, [part]);
  };
  w.__nativeSpeechFileResult = (result) => beantworte(result.requestId, result);
  w.__nativeVideoTrimResult = (result) => beantworte(result.requestId, result);
  // Der Abbruch trägt den Grund mit – daran hängt, ob die Web-App auf ihre
  // eigene Beschnitt-Bedienung zurückfällt.
  w.__nativeVideoTrimCancel = (result) =>
    beantworte(result.requestId, { ...result, reason: result.reason ?? 'cancelled' });
}

/** Schickt eine Anfrage an einen nativen Handler und wartet auf die Antwort. */
function frageNativNach<T>(
  handlerName: string,
  payload: Record<string, unknown>,
  timeoutMs: number
): Promise<{ requestId: string; value: T | null }> {
  const ziel = handler(handlerName);
  const requestId = neueAnfrageId();
  if (!isNativeApp() || !ziel) return Promise.resolve({ requestId, value: null });

  installiereRueckrufe();
  return new Promise((resolve) => {
    let erledigt = false;
    const abschluss = (value: unknown) => {
      if (erledigt) return;
      erledigt = true;
      clearTimeout(timer);
      offeneAnfragen.delete(requestId);
      resolve({ requestId, value: (value ?? null) as T | null });
    };
    const timer = setTimeout(() => {
      empfangeneStuecke.delete(requestId);
      abschluss(null);
    }, timeoutMs);
    offeneAnfragen.set(requestId, abschluss);
    try {
      ziel.postMessage({ ...payload, requestId });
    } catch {
      empfangeneStuecke.delete(requestId);
      abschluss(null);
    }
  });
}

// --- Spracherkennung ---------------------------------------------------------
//
// In WKWebView gibt es die Web Speech API nicht. Die App erkennt stattdessen
// die **fertige** Aufnahme (SFSpeechURLRecognitionRequest, nur auf dem Gerät) –
// live geht es nicht, weil WebKit während der Aufnahme das Mikrofon hält.

/** Höchstdauer einer nachträglichen Transkription. */
const SPEECH_TIMEOUT_MS = 60_000;

/**
 * Warum die Erkennung nichts geliefert hat, soweit es die Bedienung angeht:
 * `permission` = die Spracherkennung ist nicht erlaubt,
 * `language` = die Sprache fehlt auf dem Gerät (auch: nur online möglich),
 * `other` = alles Übrige (Datei, Erkennung, Zeitablauf).
 */
export type NativeSpeechError = 'permission' | 'language' | 'other';

/** Ergebnis einer nachträglichen Transkription. */
export interface NativeTranscription {
  captions: BookCaption[] | null;
  error?: NativeSpeechError;
}

/** Die native Seite meldet den Grund auf Deutsch (SpeechBridge.swift). */
function speechFehler(grund: string): NativeSpeechError {
  const wert = grund.toLowerCase();
  if (wert === 'berechtigung') return 'permission';
  if (wert === 'sprache' || wert === 'offline') return 'language';
  return 'other';
}

/** Kann die App eine Aufnahme nachträglich transkribieren? */
export function isNativeSpeechAvailable(): boolean {
  return isNativeApp() && !!handler('speech');
}

/**
 * Transkribiert eine fertige Audio-/Videoaufnahme in der iOS-App.
 * Liefert zeitgestempelte Abschnitte – oder `captions: null` samt Grund, damit
 * die Bedienung etwas Hilfreiches sagen kann (fehlende Berechtigung, Sprache
 * nicht auf dem Gerät). War schlicht nichts zu verstehen, bleibt der Grund leer;
 * Untertitel sind immer optional.
 */
export async function transcribeRecording(blob: Blob, lang: string): Promise<NativeTranscription> {
  if (!isNativeSpeechAvailable()) return { captions: null };
  let base64: string;
  try {
    base64 = await blobToBase64(blob);
  } catch {
    return { captions: null, error: 'other' };
  }
  const { value } = await frageNativNach<NativeSpeechFileResult>(
    'speech',
    { action: 'transcribeFile', base64, mime: blob.type || 'audio/mp4', lang },
    SPEECH_TIMEOUT_MS
  );
  // `value === null` heißt Zeitablauf – dafür gibt es keinen eigenen Hinweis.
  if (!value) return { captions: null, error: 'other' };
  if (value.error) return { captions: null, error: speechFehler(value.error) };
  const segmente = (value.segments ?? []).filter(
    (c) => typeof c.text === 'string' && c.text.trim().length > 0
  );
  return { captions: segmente.length > 0 ? segmente : null };
}

// --- Videoschnitt ------------------------------------------------------------

export interface NativeTrimmedVideo {
  videoData: string; // Data-URL
  mimeType: string;
  duration?: number;
}

/**
 * Wie der Schnitt ausgegangen ist.
 * `cancelled` = der Nutzer wollte nicht (nichts tun),
 * `unavailable` = hier grundsätzlich nicht möglich (Format, Fehler) – nur dann
 * lohnt der dauerhafte Rückfall auf die reinen Wiedergabegrenzen der Web-App,
 * `busy` = es läuft schon ein Schnitt (später erneut versuchen),
 * `timeout` = keine Antwort im Zeitfenster (nichts tun, nichts umstellen).
 */
export type NativeTrimOutcome =
  | { status: 'ok'; video: NativeTrimmedVideo }
  | { status: 'cancelled' }
  | { status: 'unavailable' }
  | { status: 'busy' }
  | { status: 'timeout' };

/**
 * Der Nutzer schneidet selbst – sehr großzügiges Zeitfenster. Die native Seite
 * hat einen eigenen 20-Minuten-Wächter und antwortet damit immer zuerst.
 */
const TRIM_TIMEOUT_MS = 30 * 60_000;

/** Bietet die App den System-Videoeditor an? */
export function isNativeVideoTrimAvailable(): boolean {
  return isNativeApp() && !!handler('videoTrim');
}

/**
 * Öffnet den System-Videoeditor und liefert das wirklich geschnittene Video zurück.
 */
export async function trimVideoNatively(dataUrl: string, mime?: string): Promise<NativeTrimOutcome> {
  if (!isNativeVideoTrimAvailable()) return { status: 'unavailable' };
  const base64Marker = dataUrl.indexOf(';base64,');
  if (!dataUrl.startsWith('data:') || base64Marker < 0) return { status: 'unavailable' };
  const quellMime = baseMimeType(mime) || baseMimeType(dataUrl.slice(5, base64Marker)) || 'video/mp4';
  const base64 = dataUrl.slice(base64Marker + ';base64,'.length);

  const { requestId, value } = await frageNativNach<NativeVideoTrimResult>(
    'videoTrim',
    { base64, mime: quellMime },
    TRIM_TIMEOUT_MS
  );
  const stuecke = empfangeneStuecke.get(requestId);
  empfangeneStuecke.delete(requestId);

  // `value === null` heißt Zeitablauf – das sagt nichts über das Video aus.
  if (!value) return { status: 'timeout' };
  if (value.reason === 'cancelled') return { status: 'cancelled' };
  if (value.reason === 'busy') return { status: 'busy' };
  // Bleibt: "unsupported" (Format) und "failed" – hier geht es wirklich nicht.
  if (value.reason) return { status: 'unavailable' };
  if (!stuecke || stuecke.length === 0) return { status: 'unavailable' };

  const mimeType = baseMimeType(value.mime) || 'video/mp4';
  return {
    status: 'ok',
    video: {
      videoData: `data:${mimeType};base64,${stuecke.join('')}`,
      mimeType,
      duration: value.duration && value.duration > 0 ? Math.round(value.duration) : undefined,
    },
  };
}
