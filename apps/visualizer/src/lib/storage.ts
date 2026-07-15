import type { BackgroundMode, CameraMode, VisualizerId } from '@torus/visualizers';
import type { WaveformPalette } from '@torus/shared';

export const LICENSE_STORAGE_KEY = 'torus-visualizer-license';
export const LICENSE_VERIFIED_AT_KEY = 'torus-visualizer-license-verified-at';
export const SAVED_PRESETS_KEY = 'torus-visualizer-saved-presets';
export const PRESET_KEY = 'torus-visualizer-preset';
// Palette + controls keys are versioned: the Pulse Update rebuilt the
// default look (framing, glow, living color), so everyone starts fresh on
// the new tuning. Saved presets keep their own key and survive untouched.
export const PALETTE_KEY = 'torus-visualizer-palette-v2';
export const CONTROLS_KEY = 'torus-visualizer-controls-v2';
export const EXPORT_RESOLUTION_KEY = 'torus-visualizer-export-resolution';
export const EXPORT_FPS_KEY = 'torus-visualizer-export-fps';
export const EXPORT_ASPECT_KEY = 'torus-visualizer-export-aspect';
export const SOURCE_KIND_KEY = 'torus-visualizer-source-kind';
export const SHOW_BPM_KEY = 'torus-visualizer-show-bpm';
export const HWACCEL_BANNER_DISMISSED_KEY = 'torus-visualizer-hwaccel-banner-dismissed';
export const VOLUME_KEY = 'torus-visualizer-volume';
export const TITLE_OVERLAY_KEY = 'torus-visualizer-title-overlay';
export const WATERMARK_KEY = 'torus-visualizer-watermark';
export const BACKGROUND_KEY = 'torus-visualizer-background';
export const HERO_SEEN_KEY = 'torus-visualizer-hero-seen';

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

/**
 * Export watermark settings. Free tier ignores these at draw time —
 * `show` is forced true and the default torus badge is used; only
 * licensed users can hide the watermark or substitute their own image.
 */
export interface WatermarkSettings {
  show: boolean;
  /** Downscaled PNG data URL of a user-supplied logo, or null for the default badge. */
  customImageDataUrl: string | null;
}

export const DEFAULT_WATERMARK_SETTINGS: WatermarkSettings = {
  show: true,
  customImageDataUrl: null,
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
  turbulence?: number;
  trailLength?: number;
  density?: number;
  vortexAmount?: number;
  interactStrength?: number;
  cameraDistance?: number;
  lightLevel?: number;
  /** Auto-gain on/off. Absent for legacy presets → treated as on. */
  autoGain?: boolean;
  /** Living-color amount. Absent for legacy presets → default life. */
  colorLife?: number;
  /** Linger amount. Absent for legacy presets → default echo. */
  linger?: number;
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
  /** Flow Field: fine turbulent detail 0..2. Default 1. */
  turbulence?: number;
  /** Flow Field: trail length 0..2. Default 1. */
  trailLength?: number;
  /** Flow Field: fraction of particles rendered 0..1. Default 1. */
  density?: number;
  /** Flow Field: tornado vortex strength 0..1. Default 0.25. */
  vortexAmount?: number;
  /** Flow Field: cursor-stir strength 0..2. Default 1. */
  interactStrength?: number;
  /**
   * Camera distance multiplier. 1 = each camera mode's natural framing;
   * higher pulls the camera out, lower pushes in (the engine enforces a
   * safe minimum distance from the scene center regardless).
   */
  cameraDistance?: number;
  /**
   * Global light level. 1 = default look; <1 dims the whole frame, >1
   * brightens. Useful for presets that stay too bright even at 0 bloom.
   */
  lightLevel?: number;
  /**
   * Auto-gain (AGC). When on (default), loudness is normalized automatically
   * so any song reacts well without cranking Gain; Gain then trims on top.
   * Optional for backwards-compat with saved presets from before this field.
   */
  autoGain?: boolean;
  /**
   * Living-color amount 0..1. 0 = the palette stays exactly as picked;
   * 1 = full breathing color — hue drifts at the music's pace, saturation
   * and brightness swell with loudness, drops kick the palette around the
   * color wheel. Default 0.6.
   */
  colorLife?: number;
  /**
   * How long big moments echo after they pass, 0..1. Scales only the release
   * side of the musical envelopes (attack stays instant) — 0 is the old
   * tight feel, 1 lets peaks take ~3x longer to fade. Default 0.3.
   */
  linger?: number;
  bloomIntensity: number;
  cameraMode: CameraMode;
}

/**
 * First-load defaults (the Pulse Update), tuned for the Flow Field preset.
 *
 * The intent: close, bright, colorful, and fluid out of the box. Loudness
 * is carried by auto-gain (AGC) + perceptual band scaling in `metrics.ts`;
 * punch comes from the impact envelope + the Energy expander. Framing and
 * glow match `VISUALIZERS.flow_field.defaults` so first load and "switch
 * back to Flow Field" look identical.
 */
export const DEFAULT_CONTROLS: VisualizerControls = {
  reactivity: 1.1,
  bassMix: 1,
  midMix: 1,
  highMix: 1.05,
  speed: 1,
  smoothness: 0.6,
  scale: 0.55,
  bassShake: 0.5,
  bassMaxHz: 175,
  midMaxHz: 2500,
  anima: 1,
  aura: 0,
  cinematicSpeed: 1,
  energy: 0.45,
  inflate: 0.45,
  appendages: 4,
  subSpheres: 6,
  turbulence: 1,
  trailLength: 1,
  density: 1,
  vortexAmount: 0.25,
  interactStrength: 1,
  cameraDistance: 1,
  lightLevel: 1,
  autoGain: true,
  colorLife: 0.6,
  linger: 0.3,
  bloomIntensity: 0.9,
  cameraMode: 'flow',
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
