import { describe, expect, it } from 'vitest';
import { baseMimeType, blobToDataUrl, parseDataUrl, pickRecordingMimeType } from './mediaFormats';

describe('baseMimeType', () => {
  it('entfernt Codec-Parameter und normalisiert', () => {
    expect(baseMimeType('video/webm;codecs=vp9,opus')).toBe('video/webm');
    expect(baseMimeType('video/webm; codecs=vp09.00.10.08,opus')).toBe('video/webm');
    expect(baseMimeType('Audio/MP4')).toBe('audio/mp4');
    expect(baseMimeType('')).toBe('');
  });
});

describe('blobToDataUrl', () => {
  it('schreibt nur den Basistyp in den Kopf, damit das Komma der Codecs die Data-URL nicht zerlegt', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'video/webm;codecs=vp9,opus' });
    const dataUrl = await blobToDataUrl(blob);
    expect(dataUrl.startsWith('data:video/webm;base64,')).toBe(true);
    expect(parseDataUrl(dataUrl)?.bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('nutzt den Ersatztyp, wenn der Blob keinen hat', async () => {
    const dataUrl = await blobToDataUrl(new Blob([new Uint8Array([9])]), 'audio/mp4');
    expect(dataUrl.startsWith('data:audio/mp4;base64,')).toBe(true);
  });
});

describe('parseDataUrl', () => {
  it('liest eine normale Base64-Data-URL', () => {
    const parsed = parseDataUrl('data:video/mp4;base64,AQID');
    expect(parsed?.mimeType).toBe('video/mp4');
    expect(parsed?.bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('repariert Alt-Daten, deren Kopf ein Komma in den Codecs enthält', () => {
    const parsed = parseDataUrl('data:video/webm;codecs=vp9,opus;base64,AQID');
    expect(parsed?.mimeType).toBe('video/webm');
    expect(parsed?.bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('kommt mit Leerzeichen und Punkt-Codecs von Safari klar', () => {
    const parsed = parseDataUrl('data:video/webm; codecs=vp09.00.10.08,opus;base64,AQID');
    expect(parsed?.mimeType).toBe('video/webm');
    expect(parsed?.bytes.length).toBe(3);
  });

  it('liest URL-kodierte Data-URLs ohne Base64', () => {
    const parsed = parseDataUrl('data:text/plain,Hallo%20Welt');
    expect(parsed?.mimeType).toBe('text/plain');
    expect(new TextDecoder().decode(parsed?.bytes)).toBe('Hallo Welt');
  });

  it('gibt null bei ungültigen Eingaben zurück', () => {
    expect(parseDataUrl('blob:http://x/y')).toBeNull();
    expect(parseDataUrl('data:video/mp4;base64,%%%')).toBeNull();
  });
});

describe('pickRecordingMimeType', () => {
  const play = (playable: string[]) => (type: string) => (playable.some((p) => type.startsWith(p)) ? 'probably' : '');

  it('bevorzugt MP4, wenn Aufnahme und Wiedergabe möglich sind', () => {
    const type = pickRecordingMimeType('video', () => true, play(['video/mp4', 'video/webm']));
    expect(type?.startsWith('video/mp4')).toBe(true);
  });

  it('fällt auf WebM zurück, wenn MP4 nicht aufgenommen werden kann', () => {
    const type = pickRecordingMimeType(
      'video',
      (t) => t.startsWith('video/webm'),
      play(['video/webm'])
    );
    expect(type).toBe('video/webm;codecs=vp8,opus');
  });

  it('nimmt kein Format, das der Browser zwar aufnimmt, aber nicht abspielt', () => {
    const type = pickRecordingMimeType('video', () => true, play(['video/webm;codecs=vp8']));
    expect(type).toBe('video/webm;codecs=vp8,opus');
  });

  it('lässt den Browser wählen, wenn nichts passt', () => {
    expect(pickRecordingMimeType('audio', () => false, () => '')).toBeUndefined();
  });

  it('wählt für Audio AAC in MP4 vor Opus in WebM', () => {
    const type = pickRecordingMimeType('audio', () => true, play(['audio/mp4', 'audio/webm']));
    expect(type?.startsWith('audio/mp4')).toBe(true);
  });
});
