// Prüft, dass jeder übersetzte Text im Bereich "common" einen englischen Eintrag hat.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EN_COMMON } from './en.common';
import { BUILTIN_TEMPLATES } from '../data/templates';
import { BOOK_TEMPLATES } from '../data/bookTemplates';
import { CARD_SIZES, BOOK_FORMATS, BOOK_FONT_FAMILIES, BOOK_PAGE_COLORS } from '../types';
import { PROJECT_BACKGROUNDS, DRAWING_COLORS } from '../theme';

const ROOT = join(process.cwd(), 'src');

const DIRS = [
  join(ROOT, 'components', 'projects'),
  join(ROOT, 'components', 'common'),
];

const EXTRA_FILES = [
  join(ROOT, 'pages', 'ProjectsPage.tsx'),
  join(ROOT, 'hooks', 'useShareImport.ts'),
  join(ROOT, 'services', 'shareService.ts'),
  join(ROOT, 'services', 'bookFile.ts'),
  join(ROOT, 'services', 'canvasFile.ts'),
  join(ROOT, 'services', 'projectFile.ts'),
  join(ROOT, 'services', 'bookExport.ts'),
];

function tsFilesIn(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => /\.tsx?$/.test(name) && !name.endsWith('.test.ts') && !name.endsWith('.test.tsx'))
    .map((name) => join(dir, name));
}

function allFiles(): string[] {
  return [...DIRS.flatMap(tsFilesIn), ...EXTRA_FILES];
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

const allLiterals = allFiles().flatMap(literalsIn);

// Konstanten-Labels und Vorlagennamen, die per t(variable) übersetzt werden
// (von der Literal-Suche oben nicht erfasst, da dynamisch referenziert).
const constantLabels = [
  ...Object.values(CARD_SIZES).map((c) => c.label),
  ...Object.values(BOOK_FORMATS).map((f) => f.label),
  ...Object.values(BOOK_FONT_FAMILIES).map((f) => f.label),
  ...BOOK_PAGE_COLORS.map((c) => c.name),
  ...PROJECT_BACKGROUNDS.map((b) => b.name),
  ...DRAWING_COLORS.map((c) => c.name),
  ...BUILTIN_TEMPLATES.map((t) => t.name),
  ...BOOK_TEMPLATES.map((t) => t.name),
  ...BOOK_TEMPLATES.map((t) => t.description),
];

describe('EN_COMMON', () => {
  it('findet übersetzte Texte in den common-Dateien', () => {
    expect(allLiterals.length).toBeGreaterThan(50);
  });

  it('verwendet keine Template-Literale mit ${…}', () => {
    const bad = allLiterals
      .filter((l) => l.quote === '`' && l.text.includes('${'))
      .map((l) => `${l.file}: ${l.text}`);
    expect(bad).toEqual([]);
  });

  it('hat für jeden Text eine englische Übersetzung', () => {
    const missing = [...new Set(allLiterals.map((l) => l.text))].filter((text) => !(text in EN_COMMON));
    expect(missing).toEqual([]);
  });

  it('hat für alle Konstanten-Labels und Vorlagennamen eine englische Übersetzung', () => {
    const missing = [...new Set(constantLabels)].filter((text) => !(text in EN_COMMON));
    expect(missing).toEqual([]);
  });

  it('enthält keine leeren Übersetzungen', () => {
    const empty = Object.entries(EN_COMMON)
      .filter(([, value]) => value.trim().length === 0)
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });
});
