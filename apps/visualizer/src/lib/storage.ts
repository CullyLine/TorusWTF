import type { CameraMode, VisualizerId } from '@torus/visualizers';
import type { WaveformPalette } from '@torus/shared';

export const LICENSE_STORAGE_KEY = 'torus-visualizer-license';
export const LICENSE_VERIFIED_AT_KEY = 'torus-visualizer-license-verified-at';
export const SAVED_PRESETS_KEY = 'torus-visualizer-saved-presets';
export const PRESET_KEY = 'torus-visualizer-preset';
export const PALETTE_KEY = 'torus-visualizer-palette';
export const CONTROLS_KEY = 'torus-visualizer-controls';
export const EXPORT_RESOLUTION_KEY = 'torus-visualizer-export-resolution';
export const EXPORT_FPS_KEY = 'torus-visualizer-export-fps';
export const SOURCE_KIND_KEY = 'torus-visualizer-source-kind';

export interface SavedPreset {
  id: string;
  name: string;
  createdAt: string;
  presetId: VisualizerId;
  palette: WaveformPalette;
  reactivity: number;
  bassMix: number;
  midMix: number;
  highMix: number;
  cameraMode: CameraMode;
  bloomIntensity: number;
  speed: number;
}

export interface VisualizerControls {
  reactivity: number;
  bassMix: number;
  midMix: number;
  highMix: number;
  speed: number;
  bloomIntensity: number;
  cameraMode: CameraMode;
}

export const DEFAULT_CONTROLS: VisualizerControls = {
  reactivity: 1,
  bassMix: 1,
  midMix: 1,
  highMix: 1,
  speed: 1,
  bloomIntensity: 1.1,
  cameraMode: 'drift',
};

export function loadSavedPresets(): SavedPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SAVED_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedPreset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistSavedPresets(presets: SavedPreset[]): void {
  localStorage.setItem(SAVED_PRESETS_KEY, JSON.stringify(presets));
}
