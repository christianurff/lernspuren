// Zweisprachigkeit (Deutsch/Englisch). Der deutsche Text ist der Schlüssel:
//   t('Neues Projekt') → 'New project' (en) bzw. 'Neues Projekt' (de).
// Platzhalter: t('Seite {n} von {m}', { n: 1, m: 3 }).
// Die englischen Wörterbücher liegen aufgeteilt nach Bereich in en.*.ts.
import { useSyncExternalStore } from 'react';
import { EN_COMMON } from './en.common';
import { EN_BOOK } from './en.book';
import { EN_CANVAS } from './en.canvas';

export type Language = 'de' | 'en';
export type LanguageSetting = 'auto' | Language;

const STORAGE_KEY = 'dokumentenraum_language';

const EN: Record<string, string> = { ...EN_COMMON, ...EN_BOOK, ...EN_CANVAS };

function detectLanguage(): Language {
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : '';
  return nav.toLowerCase().startsWith('de') ? 'de' : 'en';
}

function loadSetting(): LanguageSetting {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'de' || raw === 'en' || raw === 'auto') return raw;
  } catch {
    // ignorieren
  }
  return 'auto';
}

let setting: LanguageSetting = loadSetting();
let current: Language = setting === 'auto' ? detectLanguage() : setting;
const listeners = new Set<() => void>();

function applyDocumentLang() {
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}
applyDocumentLang();

export function getLanguage(): Language {
  return current;
}

export function getLanguageSetting(): LanguageSetting {
  return setting;
}

export function setLanguageSetting(next: LanguageSetting) {
  setting = next;
  current = next === 'auto' ? detectLanguage() : next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // ignorieren
  }
  applyDocumentLang();
  listeners.forEach((l) => l());
}

export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Sprachcode für Sprachausgabe/-erkennung */
export function speechLocale(): string {
  return current === 'de' ? 'de-DE' : 'en-US';
}

/** Locale für Datumsformatierung */
export function dateLocale(): string {
  return current === 'de' ? 'de-DE' : 'en-US';
}

type Params = Record<string, string | number>;

function interpolate(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match
  );
}

/** Übersetzt einen deutschen Text in die aktuelle Sprache (Fallback: der Text selbst). */
export function t(text: string, params?: Params): string {
  const translated = current === 'en' ? (EN[text] ?? text) : text;
  return interpolate(translated, params);
}

/** Wie t(), aber rendert neu, wenn die Sprache wechselt. */
export function useT(): typeof t {
  useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage);
  return t;
}

export function useLanguage(): Language {
  return useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage);
}

/** Meldet fehlende Übersetzungen (nur in der Entwicklung, für die Pflege der Wörterbücher). */
export function missingTranslations(texts: string[]): string[] {
  return texts.filter((text) => !(text in EN));
}
