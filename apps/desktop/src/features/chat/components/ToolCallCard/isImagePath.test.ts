import { describe, expect, it } from 'vitest';
import { isImagePath } from './isImagePath';

describe('isImagePath', () => {
  it.each(['chart.png', './out/chart.JPG', '/repo/a.jpeg', 'out/a.gif', 'a.WEBP'])(
    'recognizes a raster path: %s',
    (value) => {
      expect(isImagePath({ value })).toBe(true);
    },
  );

  it.each([
    null,
    undefined,
    42,
    {},
    '',
    'a.svg',
    'a.png.txt',
    'https://example.com/a.png',
    'http://example.com/a.png',
    '//example.com/a.png',
    'data:image/png;base64,a.png',
    'mailto:a.png',
    'file:/a.png',
    'javascript:a.png',
    'custom:a.png',
    'a b.png',
    'a\tb.png',
    'a\nb.png',
    'a\rb.png',
    'a.png\n',
    'a\u00a0b.png',
  ])('rejects non-path content: %s', (value) => {
    expect(isImagePath({ value })).toBe(false);
  });

  it('caps path length at 1024 characters', () => {
    expect(isImagePath({ value: `${'a'.repeat(1020)}.png` })).toBe(true);
    expect(isImagePath({ value: `${'a'.repeat(1021)}.png` })).toBe(false);
  });

  it('rejects a 50 KB multiline log ending in an image extension', () => {
    expect(isImagePath({ value: `${'log line\n'.repeat(6400)}out/chart.png` })).toBe(false);
  });
});
