// Prüft, dass jeder übersetzte Text im Bereich "canvas" einen englischen Eintrag hat.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EN_CANVAS } from './en.canvas';

const ROOT = join(process.cwd(), 'src');

function collectTsxFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectTsxFiles(full));
    } else if (/\.tsx?$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) {
      files.push(full);
    }
  }
  return files;
}

function canvasFiles(): string[] {
  const dirs = [
    join(ROOT, 'components', 'editors'),
    join(ROOT, 'components', 'toolbar'),
    join(ROOT, 'components', 'canvas'),
  ];
  const files = dirs.flatMap(collectTsxFiles);
  return [...files, join(ROOT, 'pages', 'CanvasPage.tsx')];
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

const allLiterals = canvasFiles().flatMap(literalsIn);

describe('EN_CANVAS', () => {
  it('findet übersetzte Texte in den Canvas-Dateien', () => {
    expect(allLiterals.length).toBeGreaterThan(50);
  });

  it('verwendet keine Template-Literale mit ${…}', () => {
    const bad = allLiterals
      .filter((l) => l.quote === '`' && l.text.includes('${'))
      .map((l) => `${l.file}: ${l.text}`);
    expect(bad).toEqual([]);
  });

  it('hat für jeden Text eine englische Übersetzung', () => {
    const missing = [...new Set(allLiterals.map((l) => l.text))].filter((text) => !(text in EN_CANVAS));
    expect(missing).toEqual([]);
  });

  it('enthält keine leeren Übersetzungen', () => {
    const empty = Object.entries(EN_CANVAS)
      .filter(([, value]) => value.trim().length === 0)
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });
});
