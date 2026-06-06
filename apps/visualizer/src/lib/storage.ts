import type { BackgroundMode, CameraMode, VisualizerId } from '@torus/visualizers';
import type { WaveformPalette } from '@torus/shared';

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
export const TITLE_OVERLAY_KEY = 'torus-visualizer-title-overlay';
export const BACKGROUND_KEY = 'torus-visualizer-background';

/** Reactive backdrop behind the preset. `none` = current behavior. */
export interface BackgroundSettings {
  mode: BackgroundMode;
  /** Master visibility 0..1 (always contrast-capped per-mode). */
  intensity: number;
}

export const DEFAULT_BACKGROUND: BackgroundSettings = {
  mode: 'none',
  intensity: 0.6,
};

export type OverlayPosition =
  | 'bottom-left'
  | 'bottom-center'
  | 'top-left'
  | 'top-right';

/**
 * Lower-third title card burned into exports (not the live preview).
 * `position`, `textColor`, and `bgOpacity` are paid-tier customizations;
 * free exports are clamped to bottom-left / brand defaults at draw time.
 */
export interface TitleOverlay {
  enabled: boolean;
  title: string;
  subtitle: string;
  position: OverlayPosition;
  textColor: string;
  /** Background bar opacity, 0–1. */
  bgOpacity: number;
}

export const DEFAULT_TITLE_OVERLAY: TitleOverlay = {
  enabled: false,
  title: '',
  subtitle: '',
  position: 'bottom-left',
  textColor: '#f5f5fa',
  bgOpacity: 0.55,
};

export interface SavedPreset {
  id: string;
  name: string;
  createdAt: string;
  /** 16:9 JPEG data URL captured at save time. Absent for legacy presets. */
  thumbnail?: string;
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
  subSpheres?: number;
  /** Auto-gain on/off. Absent for legacy presets → treated as on. */
  autoGain?: boolean;
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
  /**
   * Liquid Blob: max number of tight fast-orbit sub-spheres that pop on
   * high-frequency transients (hi-hats / sibilance) and melt back into
   * the main blob between hits. 0 = disabled. Default 6.
   */
  subSpheres?: number;
  /**
   * Auto-gain (AGC). When on (default), loudness is normalized automatically
   * so any song reacts well without cranking Gain; Gain then trims on top.
   * Optional for backwards-compat with saved presets from before this field.
   */
  autoGain?: boolean;
  bloomIntensity: number;
  cameraMode: CameraMode;
}

/**
 * First-load defaults, tuned for the Liquid Blob preset (the default).
 *
 * Loudness is now carried by auto-gain (AGC) + perceptual band scaling in
 * `metrics.ts`, so the gain-related controls sit near 1 instead of the old
 * extreme values (Gain 2.5, mixes ~9, Energy 2). Gain is a gentle trim,
 * the mixes nudge band balance, and Energy adds punch on top of the small
 * base punch that is always applied. The look-and-feel controls
 * (speed/smoothness/scale/shake/anima) keep their Liquid-Blob tuning.
 */
export const DEFAULT_CONTROLS: VisualizerControls = {
  reactivity: 1.1,
  bassMix: 1,
  midMix: 1,
  highMix: 1.1,
  speed: 5.95,
  smoothness: 0.95,
  scale: 0.15,
  bassShake: 2.55,
  bassMaxHz: 175,
  midMaxHz: 2500,
  anima: 1,
  aura: 0,
  cinematicSpeed: 3,
  energy: 0.3,
  inflate: 0.32,
  appendages: 4,
  subSpheres: 6,
  autoGain: true,
  bloomIntensity: 0,
  cameraMode: 'cinematic',
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

/** Rough total size of everything in localStorage, in bytes (UTF-16 ≈ 2 bytes/char). */
export function estimateLocalStorageBytes(): number {
  if (typeof window === 'undefined') return 0;
  let chars = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key === null) continue;
    chars += key.length + (localStorage.getItem(key)?.length ?? 0);
  }
  return chars * 2;
}

/** Soft cap before we stop embedding new preset thumbnails. */
export const THUMBNAIL_STORAGE_BUDGET_BYTES = 4 * 1024 * 1024;
