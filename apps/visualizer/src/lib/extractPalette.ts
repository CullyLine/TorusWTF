/**
 * Client-side dominant-color extraction for the "palette from image" feature.
 *
 * Pixels are sampled into a tiny offscreen canvas, quantized with a
 * hand-rolled median-cut algorithm (no external deps), and the three most
 * useful colors are mapped to the bass / mid / high bands by luminance.
 *
 * Nothing leaves the browser: the image is decoded, sampled, and discarded.
 */

import type { WaveformPalette } from '@torus/shared';

const SAMPLE_EDGE = 72;
const MAX_BOXES = 8;

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
  return {
    bass: toHex(bass ?? { r: 10, g: 12, b: 40 }),
    mid: toHex(mid ?? bass ?? { r: 80, g: 120, b: 200 }),
    high: toHex(high ?? mid ?? bass ?? { r: 200, g: 220, b: 255 }),
  };
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

function toHex({ r, g, b }: Rgb): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
