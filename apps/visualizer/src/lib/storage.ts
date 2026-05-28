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
export const EXPORT_ASPECT_KEY = 'torus-visualizer-export-aspect';
export const SOURCE_KIND_KEY = 'torus-visualizer-source-kind';
export const SHOW_BPM_KEY = 'torus-visualizer-show-bpm';
export const DESKTOP_GUIDE_SEEN_KEY = 'torus-visualizer-desktop-guide-seen';
export const HWACCEL_BANNER_DISMISSED_KEY = 'torus-visualizer-hwaccel-banner-dismissed';
export const VOLUME_KEY = 'torus-visualizer-volume';

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
  smoothness?: number;
  scale?: number;
  bassShake?: number;
  bassMaxHz?: number;
  midMaxHz?: number;
  anima?: number;
  aura?: number;
  cinematicSpeed?: number;
  energy?: number;
  inflate?: number;
  appendages?: number;
}

export interface VisualizerControls {
  reactivity: number;
  bassMix: number;
  midMix: number;
  highMix: number;
  speed: number;
  /** Optional for backwards-compat with localStorage from before these fields existed. */
  smoothness?: number;
  scale?: number;
  /** Subwoofer-style camera rumble keyed to bass. 0 = off, 1 = noticeable, 3 = car shaking. */
  bassShake?: number;
  /** Upper edge of the bass band in Hz. */
  bassMaxHz?: number;
  /** Upper edge of the mid band in Hz. */
  midMaxHz?: number;
  /** Anima life amount. 0 = dead-reactive, 1 = full breathing creature. */
  anima?: number;
  /** Aura amount. 0 = no wisps/glow, 1 = full presence. */
  aura?: number;
  /** Cinematic playback rate. 1 = normal, only used when cameraMode === 'cinematic'. */
  cinematicSpeed?: number;
  /**
   * Dynamic-range expansion. 0 = off; raises peaks without raising baseline.
   * Different from Gain (reactivity) which scales everything uniformly.
   */
  energy?: number;
  /**
   * Liquid Blob deformation balance. 0 = pure stretch (taffy-pull),
   * 1 = pure inflate (radial puff). Default 0.5. Only Liquid Blob uses it.
   */
  inflate?: number;
  /**
   * Liquid Blob: number of orbiting "appendage" spheres (0–10). Default 4.
   */
  appendages?: number;
  bloomIntensity: number;
  cameraMode: CameraMode;
}

export const DEFAULT_CONTROLS: VisualizerControls = {
  reactivity: 1,
  bassMix: 1,
  midMix: 1,
  highMix: 1,
  speed: 1,
  smoothness: 0,
  scale: 1,
  bassShake: 0,
  bassMaxHz: 250,
  midMaxHz: 2000,
  anima: 0.5,
  aura: 0.4,
  cinematicSpeed: 1,
  energy: 0,
  inflate: 0.5,
  appendages: 4,
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
