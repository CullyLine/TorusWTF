import sharp from 'sharp';
import type { PeaksJson } from '@torus/shared';
import type { Palette } from './palette.js';

interface OgInput {
  title: string;
  peaks: PeaksJson;
  palette: Palette;
  durationMs: number;
}

const WIDTH = 1200;
const HEIGHT = 630;
const BG = '#0A0B1E';
const FG_DIM = 'rgba(245,245,250,0.45)';
const FG = '#F5F5FA';

/**
 * Render an Open Graph preview image — 1200x630 PNG — featuring the clip's
 * waveform colored by its dominant frequency band, with the title overlaid.
 * Discord, iMessage, Twitter, Slack all pick this up via og:image.
 */
export async function renderOgImage(input: OgInput): Promise<Buffer> {
  const svg = buildSvg(input);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return png;
}

function buildSvg(input: OgInput): string {
  const { title, peaks, palette, durationMs } = input;
  const waveformY = 360;
  const waveformH = 220;
  const padding = 80;
  const usableWidth = WIDTH - padding * 2;

  const bins = downsample(peaks, Math.floor(usableWidth / 4));
  const barW = usableWidth / bins.length;
  const bars = bins
    .map((bin, i) => {
      const h = Math.max(2, Math.round(Math.min(1, bin.peak * 2.5) * waveformH));
      const x = padding + i * barW;
      const y = waveformY + (waveformH - h) / 2;
      const dom = dominantBand(bin);
      const fill = palette[dom];
      return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(1, barW - 1).toFixed(2)}" height="${h}" rx="1" fill="${fill}" opacity="0.9"/>`;
    })
    .join('');

  const escapedTitle = escapeXml(truncate(title || 'untitled', 56));
  const duration = formatDuration(durationMs);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${BG}"/>
  <g font-family="Inter, system-ui, sans-serif">
    <text x="${padding}" y="${padding + 14}" font-size="22" fill="${FG_DIM}" letter-spacing="6">TORUS.FM</text>
    <text x="${padding}" y="${padding + 100}" font-size="56" font-weight="600" fill="${FG}">${escapedTitle}</text>
    <text x="${padding}" y="${HEIGHT - padding}" font-size="20" fill="${FG_DIM}">${duration}</text>
  </g>
  ${bars}
</svg>`;
}

function downsample(peaks: PeaksJson, target: number) {
  if (peaks.bins.length <= target) return peaks.bins;
  const step = peaks.bins.length / target;
  const out: typeof peaks.bins = [];
  for (let i = 0; i < target; i++) {
    const start = Math.floor(i * step);
    const end = Math.floor((i + 1) * step);
    let peak = 0;
    let low = 0;
    let mid = 0;
    let high = 0;
    for (let j = start; j < end; j++) {
      const b = peaks.bins[j]!;
      if (b.peak > peak) peak = b.peak;
      low += b.low;
      mid += b.mid;
      high += b.high;
    }
    const n = Math.max(1, end - start);
    out.push({ peak, low: low / n, mid: mid / n, high: high / n });
  }
  return out;
}

function dominantBand(bin: { low: number; mid: number; high: number }): 'bass' | 'mid' | 'high' {
  if (bin.low >= bin.mid && bin.low >= bin.high) return 'bass';
  if (bin.high >= bin.mid && bin.high >= bin.low) return 'high';
  return 'mid';
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
