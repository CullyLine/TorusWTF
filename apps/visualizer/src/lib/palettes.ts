import type { WaveformPalette } from '@torus/shared';

export interface PalettePreset {
  id: string;
  label: string;
  palette: WaveformPalette;
}

// Prism is the first-load default of the Pulse Update — a magenta →
// violet → electric-cyan sweep that stays vivid under bloom and cycles
// beautifully once the living palette starts drifting it.
export const DEFAULT_PALETTE: WaveformPalette = {
  bass: '#FF2E93',
  mid: '#8A5CFF',
  high: '#33E5FF',
};

const TORUS_PALETTE: WaveformPalette = {
  bass: '#FF2D95',
  mid: '#22D3CE',
  high: '#F7E08C',
};

export const BUILTIN_PALETTES: PalettePreset[] = [
  { id: 'prism', label: 'Prism', palette: DEFAULT_PALETTE },
  { id: 'torus', label: 'Torus', palette: TORUS_PALETTE },
  {
    id: 'aurora',
    label: 'Aurora',
    palette: { bass: '#7C4DFF', mid: '#2BF5B7', high: '#D8FBEF' },
  },
  {
    id: 'ocean',
    label: 'Cool ocean',
    palette: { bass: '#0077B6', mid: '#00B4D8', high: '#90E0EF' },
  },
  {
    id: 'sunset',
    label: 'Warm sunset',
    palette: { bass: '#FF6B35', mid: '#F7931E', high: '#FFD23F' },
  },
  {
    id: 'ultraviolet',
    label: 'Ultraviolet',
    palette: { bass: '#3D2BFF', mid: '#B44DFF', high: '#FF7AE0' },
  },
  {
    id: 'candy',
    label: 'Candy',
    palette: { bass: '#FF4D8D', mid: '#FF9E5E', high: '#FFE86B' },
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
