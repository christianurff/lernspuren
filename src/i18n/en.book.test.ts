// Prüft, dass jeder übersetzte Text im Bereich "book" einen englischen Eintrag hat.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EN_BOOK } from './en.book';

const ROOT = join(process.cwd(), 'src');
const BOOK_DIR = join(ROOT, 'components', 'book');

function bookFiles(): string[] {
  const files = readdirSync(BOOK_DIR)
    .filter((name) => /\.tsx?$/.test(name) && !name.endsWith('.test.ts') && !name.endsWith('.test.tsx'))
    .map((name) => join(BOOK_DIR, name));
  return [...files, join(ROOT, 'pages', 'BookEditorPage.tsx'), join(ROOT, 'pages', 'OpenSharedPage.tsx')];
}

// t('…') bzw. t("…"), auch über mehrere Zeilen; `translate` ist der Alias für t()
// in Nicht-React-Code. Voranstehende Wortzeichen (z. B. `useT(`) schließen wir aus.
const CALL_RE = /(?<![A-Za-z0-9_$.])(?:t|translate)\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;

interface Literal {
  file: string;
  quote: string;
  text: string;
}

function literalsIn(file: string): Literal[] {
  const source = readFileSync(file, 'utf8');
  const found: Literal[] = [];
  for (const match of source.matchAll(CALL_RE)) {
    found.push({ file, quote: match[1], text: match[2] });
  }
  return found;
}

const allLiterals = bookFiles().flatMap(literalsIn);

describe('EN_BOOK', () => {
  it('findet übersetzte Texte in den Buch-Dateien', () => {
    expect(allLiterals.length).toBeGreaterThan(50);
  });

  it('verwendet keine Template-Literale mit ${…}', () => {
    const bad = allLiterals
      .filter((l) => l.quote === '`' && l.text.includes('${'))
      .map((l) => `${l.file}: ${l.text}`);
    expect(bad).toEqual([]);
  });

  it('hat für jeden Text eine englische Übersetzung', () => {
    const missing = [...new Set(allLiterals.map((l) => l.text))].filter((text) => !(text in EN_BOOK));
    expect(missing).toEqual([]);
  });

  it('enthält keine leeren Übersetzungen', () => {
    const empty = Object.entries(EN_BOOK)
      .filter(([, value]) => value.trim().length === 0)
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });
});
