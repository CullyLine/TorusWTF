import { describe, expect, it } from 'vitest';
import { paletteFromPixels } from './extractPalette';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function chan(rgb: { r: number; g: number; b: number }): number {
  return Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
}

describe('paletteFromPixels', () => {
  it('orders bass→high by luminance', () => {
    const pixels = [
      ...Array(50).fill({ r: 20, g: 10, b: 60 }),
      ...Array(50).fill({ r: 60, g: 120, b: 200 }),
      ...Array(50).fill({ r: 220, g: 230, b: 250 }),
    ];
    const palette = paletteFromPixels(pixels);
    const lum = (hex: string) => {
      const { r, g, b } = hexToRgb(hex);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    expect(lum(palette.bass)).toBeLessThanOrEqual(lum(palette.mid));
    expect(lum(palette.mid)).toBeLessThanOrEqual(lum(palette.high));
  });

  it('produces near-monochrome output for a grayscale image', () => {
    const grays = [];
    for (let v = 0; v < 256; v += 4) grays.push({ r: v, g: v, b: v });
    const palette = paletteFromPixels(grays);
    expect(chan(hexToRgb(palette.bass))).toBeLessThan(12);
    expect(chan(hexToRgb(palette.mid))).toBeLessThan(12);
    expect(chan(hexToRgb(palette.high))).toBeLessThan(12);
  });

  it('always returns three valid hex colors', () => {
    const palette = paletteFromPixels([{ r: 128, g: 64, b: 200 }]);
    for (const c of [palette.bass, palette.mid, palette.high]) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
