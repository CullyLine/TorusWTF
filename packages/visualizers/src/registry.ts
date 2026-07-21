import type { ComponentType } from 'react';
import type { AnalyserHandle } from './audio';
import type { ControlKey } from './controlSchema';
import type { CameraMode } from './SceneRig';
import { TorusFieldScene } from './presets/TorusField';
import { ParticleStormScene } from './presets/ParticleStorm';
import { InfiniteTunnelScene } from './presets/InfiniteTunnel';
import { VolumetricWaveformScene } from './presets/VolumetricWaveform';
import { CosmicMandalaScene } from './presets/CosmicMandala';
import { StarFieldScene } from './presets/StarField';
import { OutrunGridScene } from './presets/OutrunGrid';
import { LiquidChromeScene } from './presets/LiquidChrome';
import { LiquidBlobScene } from './presets/LiquidBlob';
import { MandelbrotZoomScene } from './presets/MandelbrotZoom';
import { SilkWakeScene } from './presets/SilkWake';
import { TideVeilScene } from './presets/TideVeil';
import { AnimaScene } from './presets/Anima';
import { FlowFieldScene } from './presets/FlowField';
import { HaloRainScene } from './presets/HaloRain';
import { MistSpiralScene } from './presets/MistSpiral';

export type VisualizerId =
  | 'anima'
  | 'flow_field'
  | 'torus_field'
  | 'particle_storm'
  | 'infinite_tunnel'
  | 'volumetric_waveform'
  | 'cosmic_mandala'
  | 'star_field'
  | 'outrun_grid'
  | 'liquid_chrome'
  | 'liquid_blob'
  | 'silk_wake'
  | 'tide_veil'
  | 'halo_rain'
  | 'mist_spiral'
  | 'mandelbrot_zoom';

/**
 * Legacy set — used to gate the BackgroundLayer off for presets that painted
 * an opaque fullscreen quad. Every preset now supports a live backdrop (the
 * fullscreen shaders switch to transparent-miss / additive compositing when
 * `backdrop` is set), so this is empty. Kept exported for API stability.
 */
export const FULLSCREEN_SHADER_PRESETS: ReadonlySet<VisualizerId> = new Set<VisualizerId>();

export interface VisualizerSceneProps {
  analyser: AnalyserHandle | null;
  palette: { bass: string; mid: string; high: string };
  tier: 'high' | 'mid' | 'low';
  /**
   * Scene scale multiplier. Most mesh-based presets are auto-scaled by a
   * `<group scale>` wrapper in `VisualizerCanvas` and can ignore this prop.
   * Fullscreen-shader presets (Liquid Blob) read it as a uniform because
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
   * Liquid-Blob-specific deformation control. 0 = pure stretch (taffy-pull
   * along a wobble axis); 1 = pure inflate (uniform radial puff). Default
   * 0.5. Other presets ignore this prop.
   */
  inflate?: number;
  /**
   * Liquid-Blob-specific: number of orbiting satellite spheres
   * ("appendages") that fuse into the blob. Default 4, capped at 10 in
   * the shader. Other presets ignore this prop.
   */
  appendages?: number;
  /**
   * Liquid-Blob-specific: maximum number of tight fast-orbit sub-spheres
   * that pop on detected high-frequency transients (hi-hats / cymbals /
   * sibilance) and melt back into the main blob between hits. Default 6,
   * capped at 8 in the shader. Other presets ignore this prop.
   */
  subSpheres?: number;
  /** Flow Field: fine turbulent detail 0..2. Other presets ignore. */
  turbulence?: number;
  /** Flow Field: trail length 0..2. Other presets ignore. */
  trailLength?: number;
  /** Flow Field: fraction of particles rendered 0..1. Other presets ignore. */
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
  // The `defaults` blocks below are starting points — tune freely. They're
  // applied whenever the user switches TO that preset; omitted fields keep
  // the user's current values.
  //
  // Framing philosophy (the Pulse Update): every preset should OWN the
  // frame at its defaults — subject filling most of the screen at the
  // default camera distance (z≈3.1, fov 50) — with real glow (bloom ≥ 0.5)
  // so the first impression is close, bright, and alive. Wheel zoom is the
  // escape hatch for establishing shots, not the default state.
  anima: {
    id: 'anima',
    label: 'Anima',
    hint: 'The living creature \u2014 aurora curtains + soul core, listens with you.',
    Scene: AnimaScene,
    defaults: {
      speed: 1,
      smoothness: 0.8,
      scale: 1,
      anima: 1,
      aura: 0.4,
      cameraMode: 'still',
      bloomIntensity: 0.55,
      cameraDistance: 1,
      lightLevel: 1,
    },
  },
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
  particle_storm: {
    id: 'particle_storm',
    label: 'Particle Storm',
    hint: 'Frequency-driven swarm. Punchy energy for big drops.',
    Scene: ParticleStormScene,
    defaults: {
      speed: 1.2,
      smoothness: 0.45,
      scale: 1,
      bassShake: 1.2,
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
    label: 'Star Field',
    hint: 'Galaxy spiral arms that tighten with the bass and twinkle on highs.',
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
  outrun_grid: {
    id: 'outrun_grid',
    label: 'Outrun Grid',
    hint: 'Synthwave horizon grid with a pulsing sun \u2014 producer-nightdrive vibes.',
    Scene: OutrunGridScene,
    defaults: {
      speed: 1.2,
      smoothness: 0.5,
      scale: 1,
      bassShake: 0.8,
      cameraMode: 'still',
      bloomIntensity: 0.7,
      cameraDistance: 1,
      lightLevel: 1,
    },
  },
  liquid_chrome: {
    id: 'liquid_chrome',
    label: 'Liquid Chrome',
    hint: 'Metallic blob morphing with bass and beats \u2014 high-gloss centerpiece.',
    Scene: LiquidChromeScene,
    defaults: {
      speed: 1,
      smoothness: 0.6,
      scale: 0.9,
      bassShake: 1,
      cameraMode: 'cinematic',
      cinematicSpeed: 1,
      bloomIntensity: 0.8,
      cameraDistance: 1,
      lightLevel: 1,
    },
  },
  liquid_blob: {
    id: 'liquid_blob',
    label: 'Liquid Blob',
    hint: 'Amorphous raymarched metaballs that fuse and split. Pure goo, no edges.',
    Scene: LiquidBlobScene,
    presetControls: ['inflate', 'appendages', 'subSpheres'],
    // The blob renders through its own in-shader camera, so framing comes
    // entirely from `scale` — 0.6 puts the goo at ~"here in the room".
    // Camera mode is 'still' because the rig camera can't move this preset.
    defaults: {
      speed: 1.1,
      smoothness: 0.7,
      scale: 0.72,
      bassShake: 0.6,
      anima: 1,
      aura: 0,
      cameraMode: 'still',
      cinematicSpeed: 1,
      inflate: 0.45,
      appendages: 4,
      subSpheres: 6,
      bloomIntensity: 0.55,
      cameraDistance: 1,
      lightLevel: 1,
    },
  },
  silk_wake: {
    id: 'silk_wake',
    label: 'Silk Wake',
    hint: 'Braided light ribbons — fold on gather, flare on impact, warm trails in afterglow.',
    Scene: SilkWakeScene,
    // Fullscreen braid owns the frame via its own clip-space quad; still
    // camera keeps the sheet stable while the shader does the motion.
    defaults: {
      speed: 1,
      smoothness: 0.7,
      scale: 1,
      bassShake: 0.35,
      anima: 0.55,
      aura: 0.3,
      cameraMode: 'still',
      bloomIntensity: 0.85,
      cameraDistance: 1,
      lightLevel: 1.05,
    },
  },
  tide_veil: {
    id: 'tide_veil',
    label: 'Tide Veil',
    hint: 'Soft caustic light-sheet — rolls with swell, folds before the beat, holds warm afterglow.',
    Scene: TideVeilScene,
    // Fullscreen veil owns the frame via its own clip-space quad; still
    // camera keeps the sheet stable while the shader does the motion.
    defaults: {
      speed: 1,
      smoothness: 0.7,
      scale: 1,
      bassShake: 0.35,
      anima: 0.6,
      aura: 0.25,
      cameraMode: 'still',
      bloomIntensity: 0.75,
      cameraDistance: 1,
      lightLevel: 1.05,
    },
  },
  halo_rain: {
    id: 'halo_rain',
    label: 'Halo Rain',
    hint: 'Concentric luminous rings drifting like celestial rain — inhale before the beat, flare on impact, tick on hats.',
    Scene: HaloRainScene,
    // Fullscreen sheet owns the frame via clip-space quad; still camera
    // keeps the rain stable while the shader does the motion.
    defaults: {
      speed: 1,
      smoothness: 0.7,
      scale: 1,
      bassShake: 0.35,
      anima: 0.55,
      aura: 0.3,
      cameraMode: 'still',
      bloomIntensity: 0.8,
      cameraDistance: 1,
      lightLevel: 1.05,
    },
  },
  mist_spiral: {
    id: 'mist_spiral',
    label: 'Mist Spiral',
    hint: 'Rising mist coils around a vertical axis — inhale on gather, flare on impact, mote glitter on hats.',
    Scene: MistSpiralScene,
    // Fullscreen mist sheet owns the frame via clip-space quad; still
    // camera keeps the column stable while the shader does the motion.
    defaults: {
      speed: 1,
      smoothness: 0.7,
      scale: 1,
      bassShake: 0.35,
      anima: 0.55,
      aura: 0.3,
      cameraMode: 'still',
      bloomIntensity: 0.8,
      cameraDistance: 1,
      lightLevel: 1.05,
    },
  },
  mandelbrot_zoom: {
    id: 'mandelbrot_zoom',
    label: 'Mandelbulb',
    hint: 'A living 3D fractal — grows more ornate as the music swells, morphs shape on drops. Fly around it.',
    Scene: MandelbrotZoomScene,
    defaults: {
      speed: 1,
      smoothness: 0.7,
      scale: 1.15,
      bassShake: 0.4,
      cameraMode: 'cinematic',
      cinematicSpeed: 1,
      bloomIntensity: 0.75,
      cameraDistance: 1,
      lightLevel: 1,
    },
  },
};
