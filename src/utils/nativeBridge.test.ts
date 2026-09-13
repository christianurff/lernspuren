// Brücke zur iOS-App: Was die native Seite meldet, muss die Web-App unterscheiden
// können — „geht hier nicht“ zieht Folgen nach sich (Rückfall auf die eigene
// Bedienung), „gerade beschäftigt“ und Zeitablauf dürfen das nicht auslösen.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BookCaption } from '../types';
import { transcribeRecording, trimVideoNatively } from './nativeBridge';

interface NativeTestWindow extends Window {
  __nativeApp?: 'ios';
  webkit?: { messageHandlers?: Record<string, { postMessage: (message: unknown) => void } | undefined> };
  __nativeChunk?: (requestId: string, part: string) => void;
  __nativeSpeechFileResult?: (result: { requestId: string; segments?: BookCaption[]; error?: string }) => void;
  __nativeVideoTrimResult?: (result: { requestId: string; mime?: string; duration?: number }) => void;
  __nativeVideoTrimCancel?: (result: { requestId: string; reason?: string }) => void;
}

const VIDEO_DATA_URL = 'data:video/mp4;base64,QUJD';

/**
 * Tut so, als liefe die Web-App im nativen Wrapper: `antwort` wird mit der
 * Anfrage-ID aufgerufen und darf über die globalen Rückrufe antworten.
 */
function alsNativeApp(name: string, antwort: (requestId: string) => void) {
  const w = window as NativeTestWindow;
  w.__nativeApp = 'ios';
  w.webkit = {
    messageHandlers: {
      [name]: {
        postMessage: (message: unknown) => {
          const { requestId } = message as { requestId: string };
          setTimeout(() => antwort(requestId), 0);
        },
      },
    },
  };
}

afterEach(() => {
  const w = window as NativeTestWindow;
  delete w.__nativeApp;
  delete w.webkit;
  vi.useRealTimers();
});

describe('trimVideoNatively', () => {
  it('meldet "unavailable" ohne native App', async () => {
    expect(await trimVideoNatively(VIDEO_DATA_URL)).toEqual({ status: 'unavailable' });
  });

  it('gibt das geschnittene Video zurück', async () => {
    alsNativeApp('videoTrim', (requestId) => {
      const w = window as NativeTestWindow;
      w.__nativeChunk?.(requestId, 'QUJD');
      w.__nativeVideoTrimResult?.({ requestId, mime: 'video/mp4', duration: 4.4 });
    });
    const outcome = await trimVideoNatively(VIDEO_DATA_URL);
    expect(outcome).toEqual({
      status: 'ok',
      video: { videoData: VIDEO_DATA_URL, mimeType: 'video/mp4', duration: 4 },
    });
  });

  it.each([
    ['cancelled', 'cancelled'],
    ['busy', 'busy'],
    ['unsupported', 'unavailable'],
    ['failed', 'unavailable'],
  ])('macht aus dem Grund "%s" den Status "%s"', async (grund, status) => {
    alsNativeApp('videoTrim', (requestId) => {
      (window as NativeTestWindow).__nativeVideoTrimCancel?.({ requestId, reason: grund });
    });
    expect(await trimVideoNatively(VIDEO_DATA_URL)).toEqual({ status });
  });

  it('meldet "timeout", wenn gar keine Antwort kommt', async () => {
    vi.useFakeTimers();
    alsNativeApp('videoTrim', () => {
      // absichtlich keine Antwort
    });
    const laeuft = trimVideoNatively(VIDEO_DATA_URL);
    // Kürzer als das Zeitfenster passiert nichts, danach greift es
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    await vi.advanceTimersByTimeAsync(10 * 60_000 + 1000);
    expect(await laeuft).toEqual({ status: 'timeout' });
  });
});

describe('transcribeRecording', () => {
  const aufnahme = () => new Blob(['x'], { type: 'audio/mp4' });

  it('liefert ohne native App nichts und keinen Grund', async () => {
    expect(await transcribeRecording(aufnahme(), 'de-DE')).toEqual({ captions: null });
  });

  it.each([
    ['berechtigung', 'permission'],
    ['sprache', 'language'],
    ['offline', 'language'],
    ['erkennung', 'other'],
    ['datei', 'other'],
    ['daten', 'other'],
  ])('macht aus dem Fehler "%s" den Grund "%s"', async (grund, error) => {
    alsNativeApp('speech', (requestId) => {
      (window as NativeTestWindow).__nativeSpeechFileResult?.({ requestId, error: grund });
    });
    expect(await transcribeRecording(aufnahme(), 'de-DE')).toEqual({ captions: null, error });
  });

  it('gibt die erkannten Abschnitte zurück', async () => {
    alsNativeApp('speech', (requestId) => {
      (window as NativeTestWindow).__nativeSpeechFileResult?.({
        requestId,
        segments: [
          { start: 0, text: 'Hallo' },
          { start: 1, text: '  ' },
        ],
      });
    });
    expect(await transcribeRecording(aufnahme(), 'de-DE')).toEqual({
      captions: [{ start: 0, text: 'Hallo' }],
    });
  });

  it('meldet ein leeres Ergebnis ohne Grund', async () => {
    alsNativeApp('speech', (requestId) => {
      (window as NativeTestWindow).__nativeSpeechFileResult?.({ requestId, segments: [] });
    });
    expect(await transcribeRecording(aufnahme(), 'de-DE')).toEqual({ captions: null });
  });
});
