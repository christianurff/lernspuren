// Blob-URLs für Medien: Sie müssen ein Aus- und sofortiges Wiedereinhängen
// überstehen. React tut das im StrictMode bei jedem Einhängen einmal — wird die
// URL dabei freigegeben, zeigt <video> nur noch einen Ladefehler.
import { act } from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMediaObjectUrl } from './mediaUrl';

const DATA_URL = 'data:audio/mp4;base64,AAAA';

let angelegt: string[];
let freigegeben: string[];
let container: HTMLDivElement;
let root: Root;

/** Rendert den Hook und meldet den zuletzt gelieferten Wert. */
function Probe({ source, sammler }: { source?: string; sammler: string[] }) {
  const url = useMediaObjectUrl(source);
  sammler.push(url ?? '');
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  angelegt = [];
  freigegeben = [];
  let zaehler = 0;
  URL.createObjectURL = vi.fn(() => {
    const url = `blob:test/${(zaehler += 1)}`;
    angelegt.push(url);
    return url;
  });
  URL.revokeObjectURL = vi.fn((url: string) => {
    freigegeben.push(url);
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.runAllTimers();
  vi.useRealTimers();
});

describe('useMediaObjectUrl', () => {
  it('macht aus einer Data-URL eine Blob-URL', () => {
    const werte: string[] = [];
    act(() => root.render(createElement(Probe, { source: DATA_URL, sammler: werte })));
    expect(werte.at(-1)).toBe(angelegt[0]);
    expect(angelegt).toHaveLength(1);
  });

  it('reicht Blob- und HTTP-URLs unverändert durch', () => {
    const werte: string[] = [];
    act(() => root.render(createElement(Probe, { source: 'blob:schon-da', sammler: werte })));
    expect(werte.at(-1)).toBe('blob:schon-da');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('behält die URL, wenn die Ansicht sofort wieder eingehängt wird', () => {
    const werte: string[] = [];
    const element = createElement(Probe, { source: DATA_URL, sammler: werte });
    act(() => root.render(element));
    const url = werte.at(-1);

    // Aus- und sofort wieder einhängen — genau das macht React im StrictMode.
    act(() => root.render(null));
    act(() => root.render(element));
    act(() => vi.runAllTimers());

    expect(werte.at(-1)).toBe(url);
    expect(freigegeben).not.toContain(url);
  });

  it('gibt die URL frei, wenn die Ansicht wirklich verschwindet', () => {
    const werte: string[] = [];
    act(() => root.render(createElement(Probe, { source: DATA_URL, sammler: werte })));
    const url = werte.at(-1)!;

    act(() => root.render(null));
    act(() => vi.runAllTimers());

    expect(freigegeben).toContain(url);
  });

  it('teilt eine Blob-URL zwischen mehreren Ansichten derselben Aufnahme', () => {
    const a: string[] = [];
    const b: string[] = [];
    act(() =>
      root.render([
        createElement(Probe, { key: 'a', source: DATA_URL, sammler: a }),
        createElement(Probe, { key: 'b', source: DATA_URL, sammler: b }),
      ])
    );
    expect(a.at(-1)).toBe(b.at(-1));
    expect(angelegt).toHaveLength(1);
  });
});
