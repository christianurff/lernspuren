import { describe, it, expect } from 'vitest';
import { wrapText, type TextMeasurer } from './bookRenderer';

/** Fake-Messkontext: jedes Zeichen ist genau 10 Punkte breit. */
const ctx: TextMeasurer = {
  measureText: (text: string) => ({ width: text.length * 10 }),
};

describe('wrapText', () => {
  it('lässt kurzen Text unverändert', () => {
    expect(wrapText(ctx, 'Hallo', 100)).toEqual(['Hallo']);
  });

  it('nutzt die volle Breite aus (genau passende Zeile bleibt ganz)', () => {
    // 'Hallo Welt' = 10 Zeichen = 100 Punkte = maxWidth
    expect(wrapText(ctx, 'Hallo Welt', 100)).toEqual(['Hallo Welt']);
  });

  it('bricht an Leerzeichen um', () => {
    expect(wrapText(ctx, 'Hallo liebe Welt', 100)).toEqual(['Hallo', 'liebe Welt']);
  });

  it('trennt überlange Wörter hart', () => {
    expect(wrapText(ctx, 'Donaudampfschiff', 100)).toEqual(['Donaudampf', 'schiff']);
  });

  it('trennt ein überlanges Wort auch nach einem vorherigen Wort korrekt', () => {
    expect(wrapText(ctx, 'ab Donaudampfschiff', 100)).toEqual(['ab', 'Donaudampf', 'schiff']);
  });

  it('respektiert explizite Zeilenumbrüche', () => {
    expect(wrapText(ctx, 'eins\nzwei', 100)).toEqual(['eins', 'zwei']);
  });

  it('erhält leere Zeilen', () => {
    expect(wrapText(ctx, 'eins\n\nzwei', 100)).toEqual(['eins', '', 'zwei']);
  });

  it('erhält eine abschließende leere Zeile', () => {
    expect(wrapText(ctx, 'eins\n', 100)).toEqual(['eins', '']);
  });

  it('gibt für leeren Text genau eine leere Zeile zurück', () => {
    expect(wrapText(ctx, '', 100)).toEqual(['']);
  });

  it('kombiniert Umbruch an Leerzeichen und harte Trennung', () => {
    expect(wrapText(ctx, 'Wir fahren mit dem Donaudampfschiff los', 100)).toEqual([
      'Wir fahren',
      'mit dem',
      'Donaudampf',
      'schiff los',
    ]);
  });
});
