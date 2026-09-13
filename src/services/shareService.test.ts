// Teilen-Links müssen auch dort stimmen, wo die Web-App nicht unter https läuft:
// in der iOS-App ist `window.location.origin` `app://lernspuren`.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareUrlFor, uploadShare } from './shareService';

const WEB_LINK = 'https://lernspuren.urff.app/#/open/abc';

interface NativeTestWindow extends Window {
  __nativeApp?: 'ios';
}

/** Tut so, als liefe die Seite unter dem angegebenen Protokoll. */
function mitOrt<T>(ort: { protocol: string; origin: string; pathname: string }, fn: () => T): T {
  const original = window.location;
  Object.defineProperty(window, 'location', { configurable: true, value: ort });
  try {
    return fn();
  } finally {
    Object.defineProperty(window, 'location', { configurable: true, value: original });
  }
}

/** Ersetzt XMLHttpRequest durch eine Attrappe, die sofort mit `antwort` antwortet. */
function antworteMit(antwort: unknown, status = 200) {
  class FakeXhr {
    status = status;
    responseText = JSON.stringify(antwort);
    timeout = 0;
    upload = { onprogress: null as ((e: ProgressEvent) => void) | null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    open() {}
    setRequestHeader() {}
    abort() {}
    send() {
      this.onload?.();
    }
  }
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
}

afterEach(() => {
  delete (window as NativeTestWindow).__nativeApp;
  vi.unstubAllGlobals();
});

describe('shareUrlFor', () => {
  it('nutzt im Web die eigene Adresse', () => {
    expect(shareUrlFor('abc')).toBe(`${window.location.origin}${window.location.pathname}#/open/abc`);
  });

  it('nutzt in der iOS-App die feste Web-Adresse', () => {
    (window as NativeTestWindow).__nativeApp = 'ios';
    expect(shareUrlFor('abc')).toBe(WEB_LINK);
  });

  it('nutzt die feste Web-Adresse, wenn die Seite nicht über http(s) läuft', () => {
    const link = mitOrt({ protocol: 'app:', origin: 'app://lernspuren', pathname: '/' }, () =>
      shareUrlFor('abc')
    );
    expect(link).toBe(WEB_LINK);
  });
});

describe('uploadShare', () => {
  const datei = new Blob(['x'], { type: 'application/zip' });
  const optionen = { kind: 'book' as const, days: 7 as const, name: 'Buch' };

  it('übernimmt die Adresse aus der Worker-Antwort', async () => {
    antworteMit({ id: 'abc', deleteToken: 'tok', expiresAt: 1, url: WEB_LINK });
    (window as NativeTestWindow).__nativeApp = 'ios';
    const result = await uploadShare(datei, optionen);
    expect(result.url).toBe(WEB_LINK);
  });

  it('baut die Adresse selbst, wenn der Worker keine mitschickt', async () => {
    antworteMit({ id: 'abc', deleteToken: 'tok', expiresAt: 1 });
    const result = await uploadShare(datei, optionen);
    expect(result.url).toBe(`${window.location.origin}${window.location.pathname}#/open/abc`);
  });

  it('verwirft eine Adresse ohne https', async () => {
    antworteMit({ id: 'abc', deleteToken: 'tok', expiresAt: 1, url: 'http://example.com/#/open/abc' });
    (window as NativeTestWindow).__nativeApp = 'ios';
    const result = await uploadShare(datei, optionen);
    expect(result.url).toBe(WEB_LINK);
  });
});
