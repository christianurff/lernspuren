import { describe, expect, it } from 'vitest';
import { dataUrlByteSize } from './imageCompression';

describe('dataUrlByteSize', () => {
  it('rechnet Base64-Zeichen in echte Bytes um', () => {
    // "abc" -> "YWJj" (4 Zeichen, 3 Bytes)
    expect(dataUrlByteSize('data:image/jpeg;base64,YWJj')).toBe(3);
    // "ab" -> "YWI=" (1 Padding-Zeichen, 2 Bytes)
    expect(dataUrlByteSize('data:image/jpeg;base64,YWI=')).toBe(2);
    // "a" -> "YQ==" (2 Padding-Zeichen, 1 Byte)
    expect(dataUrlByteSize('data:image/jpeg;base64,YQ==')).toBe(1);
  });

  it('liegt rund ein Viertel unter der Zeichenlänge', () => {
    const payload = 'A'.repeat(4000);
    const dataUrl = `data:image/jpeg;base64,${payload}`;
    expect(dataUrlByteSize(dataUrl)).toBe(3000);
    expect(dataUrlByteSize(dataUrl)).toBeLessThan(dataUrl.length);
  });
});
