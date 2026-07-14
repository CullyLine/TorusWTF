/**
 * Client-side dominant-color extraction for the "palette from image" feature.
 *
 * Pixels are sampled into a tiny offscreen canvas, quantized with a
 * hand-rolled median-cut algorithm (no external deps), and the three most
 * useful colors are mapped to the bass / mid / high bands by luminance.
 *
 * The raw extraction is then "vivified": the visualizer is a light show, so
 * a palette that is technically faithful but gray makes every scene look
 * broken. We keep the artwork's hues and tonal ordering, but guarantee
 * enough saturation and a usable lightness range. Truly grayscale artwork
 * (no hue information at all) borrows the house hues instead, keeping the
 * art's light/dark character.
 *
 * Nothing leaves the browser: the image is decoded, sampled, and discarded.
 */

import type { WaveformPalette } from '@torus/shared';

const SAMPLE_EDGE = 72;
const MAX_BOXES = 8;

/** Below this saturation a swatch carries no meaningful hue. */
const GRAY_SAT = 0.12;

/** Hues used when the artwork itself is colorless (Prism: pink/violet/cyan). */
const FALLBACK_HUES = { bass: 0.925, mid: 0.713, high: 0.522 } as const;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface ColorBox {
  pixels: Rgb[];
}

export async function extractPaletteFromBlob(source: Blob): Promise<WaveformPalette> {
  const pixels = await samplePixels(source);
  if (pixels.length === 0) throw new Error('No pixels to sample');
  return paletteFromPixels(pixels);
}

async function samplePixels(source: Blob): Promise<Rgb[]> {
  const bitmap = await createImageBitmap(source);
  try {
    const scale = Math.min(1, SAMPLE_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D context unavailable');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    const pixels: Rgb[] = [];
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3] ?? 0;
      if (a < 125) continue; // skip mostly-transparent pixels
      pixels.push({ r: data[i] ?? 0, g: data[i + 1] ?? 0, b: data[i + 2] ?? 0 });
    }
    return pixels;
  } finally {
    bitmap.close();
  }
}

export function paletteFromPixels(pixels: Rgb[]): WaveformPalette {
  const boxes = medianCut(pixels, MAX_BOXES);
  const candidates = boxes
    .map((box) => ({ color: averageColor(box.pixels), weight: box.pixels.length }))
    .filter((c) => c.weight > 0);

  const chosen = pickThree(candidates);
  chosen.sort((a, b) => luminance(a) - luminance(b));

  const [bass, mid, high] = chosen;
  return vivify({
    bass: bass ?? { r: 10, g: 12, b: 40 },
    mid: mid ?? bass ?? { r: 80, g: 120, b: 200 },
    high: high ?? mid ?? bass ?? { r: 200, g: 220, b: 255 },
  });
}

/**
 * Make an extracted trio usable as a light-show palette: keep the artwork's
 * hues but enforce minimum saturation and a spread of lightness so bass reads
 * deep, mid reads rich, and high reads bright. Colorless swatches inherit the
 * house hues (so grayscale covers still produce a beautiful show).
 */
function vivify(raw: { bass: Rgb; mid: Rgb; high: Rgb }): WaveformPalette {
  const bands = [
    { key: 'bass' as const, minSat: 0.75, minL: 0.32, maxL: 0.52 },
    { key: 'mid' as const, minSat: 0.7, minL: 0.45, maxL: 0.62 },
    { key: 'high' as const, minSat: 0.6, minL: 0.55, maxL: 0.74 },
  ];

  const out = {} as Record<'bass' | 'mid' | 'high', string>;
  for (const band of bands) {
    const { h, s, l } = rgbToHsl(raw[band.key]);
    const hue = s < GRAY_SAT ? FALLBACK_HUES[band.key] : h;
    const sat = Math.max(s, band.minSat);
    const light = Math.min(Math.max(l, band.minL), band.maxL);
    out[band.key] = toHex(hslToRgb(hue, sat, light));
  }
  return out;
}

function medianCut(pixels: Rgb[], maxBoxes: number): ColorBox[] {
  if (pixels.length === 0) return [];
  let boxes: ColorBox[] = [{ pixels }];

  while (boxes.length < maxBoxes) {
    // Split the box with the largest single-channel range.
    let target = -1;
    let bestRange = 0;
    let bestChannel: keyof Rgb = 'r';
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]!;
      if (box.pixels.length < 2) continue;
      const { channel, range } = widestChannel(box.pixels);
      if (range > bestRange) {
        bestRange = range;
        target = i;
        bestChannel = channel;
      }
    }
    if (target < 0 || bestRange === 0) break;

    const box = boxes[target]!;
    const sorted = [...box.pixels].sort((a, b) => a[bestChannel] - b[bestChannel]);
    const mid = sorted.length >> 1;
    const left: ColorBox = { pixels: sorted.slice(0, mid) };
    const right: ColorBox = { pixels: sorted.slice(mid) };
    boxes = [...boxes.slice(0, target), left, right, ...boxes.slice(target + 1)];
  }

  return boxes;
}

function widestChannel(pixels: Rgb[]): { channel: keyof Rgb; range: number } {
  let rMin = 255,
    rMax = 0,
    gMin = 255,
    gMax = 0,
    bMin = 255,
    bMax = 0;
  for (const p of pixels) {
    if (p.r < rMin) rMin = p.r;
    if (p.r > rMax) rMax = p.r;
    if (p.g < gMin) gMin = p.g;
    if (p.g > gMax) gMax = p.g;
    if (p.b < bMin) bMin = p.b;
    if (p.b > bMax) bMax = p.b;
  }
  const rr = rMax - rMin;
  const gr = gMax - gMin;
  const br = bMax - bMin;
  if (rr >= gr && rr >= br) return { channel: 'r', range: rr };
  if (gr >= rr && gr >= br) return { channel: 'g', range: gr };
  return { channel: 'b', range: br };
}

function averageColor(pixels: Rgb[]): Rgb {
  let r = 0,
    g = 0,
    b = 0;
  for (const p of pixels) {
    r += p.r;
    g += p.g;
    b += p.b;
  }
  const n = pixels.length || 1;
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

/**
 * Choose three colors that spread across the luminance range while
 * preferring populous, saturated swatches — avoids three near-identical
 * muddy tones on busy artwork.
 */
function pickThree(candidates: { color: Rgb; weight: number }[]): Rgb[] {
  if (candidates.length === 0) return [];
  if (candidates.length <= 3) return candidates.map((c) => c.color);

  const scored = candidates
    .map((c) => ({
      color: c.color,
      score: c.weight * (0.35 + 0.65 * saturation(c.color)),
      lum: luminance(c.color),
    }))
    .sort((a, b) => a.lum - b.lum);

  const third = Math.ceil(scored.length / 3);
  const bands = [scored.slice(0, third), scored.slice(third, third * 2), scored.slice(third * 2)];

  const result: Rgb[] = [];
  for (const band of bands) {
    if (band.length === 0) continue;
    const best = band.reduce((a, b) => (b.score > a.score ? b : a));
    result.push(best.color);
  }
  return result.length > 0 ? result : candidates.slice(0, 3).map((c) => c.color);
}

function saturation({ r, g, b }: Rgb): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return {
    r: Math.round(channel(h + 1 / 3) * 255),
    g: Math.round(channel(h) * 255),
    b: Math.round(channel(h - 1 / 3) * 255),
  };
}

function toHex({ r, g, b }: Rgb): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
