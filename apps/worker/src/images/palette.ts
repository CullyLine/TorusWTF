import type { PeaksJson, WaveformPalette } from '@torus/shared';

export type Palette = WaveformPalette;

/**
 * Brand color anchors. The clip-specific palette nudges these slightly
 * based on the dominant-band ratios so every clip feels visually unique
 * while staying inside the torus visual language.
 */
const ANCHORS = {
  bass: { h: 326, s: 100, l: 59 }, // #FF2D95
  mid: { h: 178, s: 70, l: 48 }, // #22D3CE
  high: { h: 49, s: 85, l: 76 }, // #F7E08C
};

/**
 * Derive a 3-color palette for a clip from its per-band energy averages.
 * Strong bass → magenta gets pushed warmer (more red).
 * Heavy mids → teal shifts toward cyan.
 * Bright highs → gold shifts toward white-gold.
 */
export function palettize(peaks: PeaksJson): Palette {
  if (peaks.bins.length === 0) {
    return {
      bass: hsl(ANCHORS.bass),
      mid: hsl(ANCHORS.mid),
      high: hsl(ANCHORS.high),
    };
  }

  let lo = 0;
  let mi = 0;
  let hi = 0;
  for (const bin of peaks.bins) {
    lo += bin.low;
    mi += bin.mid;
    hi += bin.high;
  }
  const n = peaks.bins.length;
  lo /= n;
  mi /= n;
  hi /= n;

  // Push hue +/- a few degrees toward warmer for bass-heavy, etc.
  const bass = { ...ANCHORS.bass, h: ANCHORS.bass.h + Math.round((lo - 0.33) * 20) };
  const mid = { ...ANCHORS.mid, h: ANCHORS.mid.h + Math.round((mi - 0.33) * 20) };
  const high = { ...ANCHORS.high, l: clamp(ANCHORS.high.l + Math.round((hi - 0.33) * 10), 50, 90) };

  return { bass: hsl(bass), mid: hsl(mid), high: hsl(high) };
}

function hsl({ h, s, l }: { h: number; s: number; l: number }): string {
  return hslToHex(((h % 360) + 360) % 360, clamp(s, 0, 100), clamp(l, 0, 100));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const color = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
