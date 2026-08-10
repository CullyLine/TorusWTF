import type { ComponentType } from 'react';
import type { AnalyserHandle } from './audio';
import type { ControlKey } from './controlSchema';
import type { CameraMode } from './SceneRig';
import { TorusFieldScene } from './presets/TorusField';
import { InfiniteTunnelScene } from './presets/InfiniteTunnel';
import { VolumetricWaveformScene } from './presets/VolumetricWaveform';
import { CosmicMandalaScene } from './presets/CosmicMandala';
import { StarFieldScene } from './presets/StarField';
import { LiquidBlobScene } from './presets/LiquidBlob';
import { FlowFieldScene } from './presets/FlowField';
import { TidalSanctuaryScene } from './presets/TidalSanctuary';

export type VisualizerId =
  | 'flow_field'
  | 'torus_field'
  | 'infinite_tunnel'
  | 'volumetric_waveform'
  | 'cosmic_mandala'
  | 'star_field'
  | 'liquid_blob'
  | 'tidal_sanctuary';

/**
 * Visualizers removed in the curation pass. Saved looks and show files that
 * still point at one of these are steered to the closest surviving visualizer
 * rather than failing to load.
 */
export const RETIRED_VISUALIZER_IDS: Readonly<Record<string, VisualizerId>> = {
  // Fullscreen 2D shader family — retired wholesale.
  silk_wake: 'tidal_sanctuary',
  tide_veil: 'tidal_sanctuary',
  halo_rain: 'cosmic_mandala',
  mist_spiral: 'flow_field',
  night_bloom: 'cosmic_mandala',
  ink_bloom: 'flow_field',
  opal_slick: 'tidal_sanctuary',
  frost_bloom: 'cosmic_mandala',
  thunderhead: 'tidal_sanctuary',
  // Particle and creature scenes.
  anima: 'liquid_blob',
  particle_storm: 'flow_field',
  ember_drift: 'flow_field',
  murmuration: 'flow_field',
  jellyfish_bloom: 'liquid_blob',
  moth_ballet: 'flow_field',
  glowworm_grotto: 'star_field',
  paper_lanterns: 'star_field',
  koi_pond: 'tidal_sanctuary',
  // Geometry and terrain scenes.
  outrun_grid: 'infinite_tunnel',
  liquid_chrome: 'liquid_blob',
  dune_sea: 'tidal_sanctuary',
  rainforest_reverie: 'tidal_sanctuary',
  alien_planet: 'tidal_sanctuary',
  mandelbrot_zoom: 'liquid_blob',
  // Retired before this pass.
  spectral_tunnel: 'infinite_tunnel',
};

/**
 * Maps any stored visualizer id onto one that still exists. Returns null for
 * ids that were never valid, so callers can tell "retired" from "garbage".
 */
export function resolveVisualizerId(id: string): VisualizerId | null {
  if (id in VISUALIZERS) return id as VisualizerId;
  return RETIRED_VISUALIZER_IDS[id] ?? null;
}

export interface VisualizerSceneProps {
  analyser: AnalyserHandle | null;
  palette: { bass: string; mid: string; high: string };
  tier: 'high' | 'mid' | 'low';
  /**
   * Scene scale multiplier. Most mesh-based presets are auto-scaled by a
   * `<group scale>` wrapper in `VisualizerCanvas` and can ignore this prop.
   * Fullscreen-shader presets (such as Lava Choir) read it as a uniform because
   * their vertex shaders bypass the model matrix.
   */
  scale?: number;
  /**
   * Motion pace multiplier. 1 = natural pace. Presets that accumulate
   * their own animation phase should multiply their per-frame advance by
   * this so the Speed control actually changes what the user sees.
   */
  speed?: number;
  /**
   * Lava Choir (liquid_blob): orb puff + smooth-union fusion. 0 = distinct
   * stretching voices; 1 = plush fused choir. Default ~0.55. Other presets
   * ignore this prop.
   */
  inflate?: number;
  /**
   * Lava Choir (liquid_blob): persistent harmonic voice / orb count.
   * Default 5, capped at 10 in the shader. Other presets ignore this prop.
   */
  appendages?: number;
  /**
   * Lava Choir (liquid_blob): transient high-frequency voice / orb count
   * (shimmer-gated). Default 5, capped at 8 in the shader. Other presets
   * ignore this prop.
   */
  subSpheres?: number;
  /** Flow Field / Tunnel / Rainforest / Tidal: fine turbulent detail 0..2. Others ignore. */
  turbulence?: number;
  /** Flow Field: trail length 0..2. Other presets ignore. */
  trailLength?: number;
  /** Flow Field / Tunnel / Rainforest / Tidal: coverage density 0..1. Others ignore. */
  density?: number;
  /** Flow Field: tornado vortex strength 0..1. Other presets ignore. */
  vortexAmount?: number;
  /** Flow Field: pointer-stir strength 0..2. Other presets ignore. */
  interactStrength?: number;
  /**
   * True when a BackgroundLayer environment is active behind the preset.
   * Fullscreen-shader presets use this to composite over the sky (alpha-out
   * their ray misses / switch to additive) instead of painting an opaque
   * built-in background.
   */
  backdrop?: boolean;
}

/**
 * Per-preset default slider values, applied when the user switches to the
 * preset. Only the fields listed here change — anything omitted keeps the
 * user's current setting, so audio-response tuning (Gain, band mixes,
 * auto sensitivity) survives preset hopping unless a preset opts in.
 *
 * These are meant to be hand-tuned per preset: edit the `defaults` blocks
 * in `VISUALIZERS` below.
 */
export interface PresetControlDefaults {
  reactivity?: number;
  bassMix?: number;
  midMix?: number;
  highMix?: number;
  speed?: number;
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
  autoGain?: boolean;
  bloomIntensity?: number;
  cameraMode?: CameraMode;
  /** Camera distance multiplier. 1 = natural framing. */
  cameraDistance?: number;
  /** Global brightness. 1 = default; <1 dims, >1 brightens. */
  lightLevel?: number;
}

export interface VisualizerDefinition {
  id: VisualizerId;
  label: string;
  hint: string;
  Scene: ComponentType<VisualizerSceneProps>;
  /** Slider values applied when the user switches to this preset. */
  defaults?: PresetControlDefaults;
  /**
   * Extra controls this preset owns, shown in the "This preset" panel
   * section. Keys must have a `group: 'preset'` def in `CONTROL_SCHEMA`.
   * The panel renders them generically — new presets never touch UI code.
   */
  presetControls?: ControlKey[];
}

/**
 * The single source of truth for available 3D presets.
 *
 * Adding a new preset is a one-file change for contributors:
 *   1. Drop a new component into `./presets/`
 *   2. Add an entry here
 *
 * See CONTRIBUTING.md.
 */
export const VISUALIZERS: Record<VisualizerId, VisualizerDefinition> = {
  flow_field: {
    id: 'flow_field',
    label: 'Flow Field',
    hint: 'A quarter-million particles riding living currents \u2014 chaos that flows into collective motion. Stir it with your cursor.',
    Scene: FlowFieldScene,
    presetControls: ['turbulence', 'trailLength', 'density', 'vortexAmount', 'interactStrength'],
    defaults: {
      speed: 1,
      smoothness: 0.6,
      scale: 0.62,
      bassShake: 0.5,
      cameraMode: 'flow',
      bloomIntensity: 0.9,
      cameraDistance: 1,
      lightLevel: 1,
      turbulence: 1,
      trailLength: 1,
      density: 1,
      vortexAmount: 0.25,
      interactStrength: 1,
    },
  },
  torus_field: {
    id: 'torus_field',
    label: 'Torus Field',
    hint: 'Sacred-geometry energy flow \u2014 the brand signature.',
    Scene: TorusFieldScene,
    defaults: {
      speed: 1,
      smoothness: 0.6,
      scale: 0.85,
      bassShake: 0.8,
      cameraMode: 'cinematic',
      cinematicSpeed: 1,
      bloomIntensity: 1.1,
      cameraDistance: 1,
      lightLevel: 1,
    },
  },
  infinite_tunnel: {
    id: 'infinite_tunnel',
    label: 'Tunnel',
    hint: 'An infinite tunnel rushing past \u2014 walls explode on bass, pyramids bite on mids, souls ride the current.',
    Scene: InfiniteTunnelScene,
    presetControls: ['turbulence', 'density', 'vortexAmount'],
    defaults: {
      speed: 1,
      smoothness: 0.55,
      scale: 1,
      bassShake: 0.8,
      cameraMode: 'drift',
      bloomIntensity: 0.9,
      cameraDistance: 1,
      lightLevel: 1,
      turbulence: 1,
      density: 1,
      vortexAmount: 0.25,
    },
  },
  volumetric_waveform: {
    id: 'volumetric_waveform',
    label: 'Volumetric Waveform',
    hint: 'The waveform extruded into 3D \u2014 minimal, universal.',
    Scene: VolumetricWaveformScene,
    defaults: {
      speed: 1,
      smoothness: 0.5,
      scale: 1.15,
      bassShake: 0.7,
      cameraMode: 'drift',
      bloomIntensity: 0.9,
      cameraDistance: 1,
      lightLevel: 1,
    },
  },
  cosmic_mandala: {
    id: 'cosmic_mandala',
    label: 'Cosmic Mandala',
    hint: 'Sacred-geometry rings in radial symmetry \u2014 brand-aligned calm power.',
    Scene: CosmicMandalaScene,
    defaults: {
      speed: 1,
      smoothness: 0.7,
      scale: 1,
      bassShake: 0.5,
      cameraMode: 'drift',
      bloomIntensity: 1,
      cameraDistance: 1,
      lightLevel: 1,
    },
  },
  star_field: {
    id: 'star_field',
    label: 'Galaxy Garden',
    hint: 'Dimensional spiral galaxy with a black-hole core — bass lensing, drop shockwaves, shimmer glints.',
    Scene: StarFieldScene,
    defaults: {
      speed: 1,
      smoothness: 0.6,
      scale: 1,
      bassShake: 0.6,
      cameraMode: 'cinematic',
      cinematicSpeed: 1,
      bloomIntensity: 0.9,
      cameraDistance: 1.15,
      lightLevel: 1,
    },
  },
  liquid_blob: {
    id: 'liquid_blob',
    label: 'Lava Choir',
    hint: 'Sculptural choir of breathing lava orbs — fused voices, hot harmonic rims.',
    Scene: LiquidBlobScene,
    presetControls: ['inflate', 'appendages', 'subSpheres'],
    // Orthographic in-shader camera; framing is entirely from `scale`.
    // Camera mode is 'still' because the rig camera can't move this preset.
    defaults: {
      speed: 1.05,
      smoothness: 0.7,
      scale: 0.85,
      bassShake: 0.55,
      anima: 1,
      aura: 0,
      cameraMode: 'still',
      cinematicSpeed: 1,
      inflate: 0.55,
      appendages: 5,
      subSpheres: 5,
      bloomIntensity: 0.6,
      cameraDistance: 1,
      lightLevel: 1,
    },
  },
  tidal_sanctuary: {
    id: 'tidal_sanctuary',
    label: 'Tidal Sanctuary',
    hint: 'A living ocean height-field — swells on bass, crest pulses on kick, foam on shimmer, glassy in silence.',
    Scene: TidalSanctuaryScene,
    presetControls: ['turbulence', 'density'],
    // Clip-space ocean owns framing via scale; still camera keeps the sea stable.
    defaults: {
      speed: 1,
      smoothness: 0.7,
      scale: 1,
      bassShake: 0.35,
      anima: 0.55,
      aura: 0.25,
      cameraMode: 'still',
      bloomIntensity: 0.65,
      cameraDistance: 1,
      lightLevel: 1.05,
      turbulence: 1,
      density: 0.75,
    },
  },
};
