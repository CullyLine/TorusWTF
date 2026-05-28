import type { WaveformPalette } from '@torus/shared';

export interface PalettePreset {
  id: string;
  label: string;
  palette: WaveformPalette;
}

// Cool Ocean is the new first-load default — it pairs best with the
// Liquid Blob defaults baked into DEFAULT_CONTROLS.
export const DEFAULT_PALETTE: WaveformPalette = {
  bass: '#0077B6',
  mid: '#00B4D8',
  high: '#90E0EF',
};

const TORUS_PALETTE: WaveformPalette = {
  bass: '#FF2D95',
  mid: '#22D3CE',
  high: '#F7E08C',
};

export const BUILTIN_PALETTES: PalettePreset[] = [
  { id: 'ocean', label: 'Cool ocean', palette: DEFAULT_PALETTE },
  { id: 'torus', label: 'Torus', palette: TORUS_PALETTE },
  {
    id: 'sunset',
    label: 'Warm sunset',
    palette: { bass: '#FF6B35', mid: '#F7931E', high: '#FFD23F' },
  },
  {
    id: 'mono',
    label: 'Monochrome',
    palette: { bass: '#FFFFFF', mid: '#CCCCCC', high: '#888888' },
  },
];

export function isChromium(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Chrome|Chromium|Edg/.test(ua) && !/Firefox/.test(ua);
}
