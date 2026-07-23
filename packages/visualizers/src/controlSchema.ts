/**
 * Schema-driven control definitions — the single source of truth for every
 * numeric control the visualizer exposes.
 *
 * The control panel renders directly from this schema (label, range, hint,
 * grouping), presets declare which extra controls they own via
 * `presetControls` in the registry, and fallback values live here instead of
 * being scattered through UI code. Adding a preset with custom sliders means
 * adding defs here and listing their keys in the registry entry — no panel
 * changes.
 *
 * Inspired by nw_wrld's `static methods` option schema, adapted to TorusFM's
 * continuous-control model.
 */

import { EMITTER_CONTROLS } from './emitters/settings';
import type { EmitterControlKey } from './emitters/types';

export type ControlKey =
  | 'reactivity'
  | 'energy'
  | 'smoothness'
  | 'linger'
  | 'speed'
  | 'anima'
  | 'colorLife'
  | 'bloomIntensity'
  | 'lightLevel'
  | 'aura'
  | 'shaderMix'
  | 'scale'
  | 'cameraDistance'
  | 'bassShake'
  | 'depthOfField'
  | 'cinematicSpeed'
  | 'bassMix'
  | 'midMix'
  | 'highMix'
  | 'inflate'
  | 'appendages'
  | 'subSpheres'
  | 'turbulence'
  | 'trailLength'
  | 'density'
  | 'vortexAmount'
  | 'interactStrength'
  | EmitterControlKey;

export type ControlGroup = 'feel' | 'color' | 'effects' | 'framing' | 'bands' | 'preset';

export interface ControlDef {
  key: ControlKey;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Value assumed when persisted controls predate this key. */
  fallback: number;
  /** Plain-language tooltip for jargon-y controls. */
  hint?: string;
  group: ControlGroup;
  /** Label variant shown while auto-gain is enabled. */
  labelAutoGain?: string;
  /** Hint variant shown while auto-gain is enabled. */
  hintAutoGain?: string;
  /** Only meaningful when this camera mode is active. */
  requiresCameraMode?: string;
}

export type ToggleControlKey = 'highlightProtection';

export interface ToggleControlDef {
  key: ToggleControlKey;
  label: string;
  /** Value assumed when persisted settings predate this key. */
  fallback: boolean;
  hint?: string;
  group: ControlGroup;
}

export const TOGGLE_CONTROL_SCHEMA: readonly ToggleControlDef[] = [
  {
    key: 'highlightProtection',
    label: 'Highlight protection',
    fallback: true,
    hint: 'Preserves color and detail when bright effects would otherwise clip to white',
    group: 'effects',
  },
];

export const TOGGLE_CONTROL_DEFS_BY_KEY: Readonly<Record<ToggleControlKey, ToggleControlDef>> =
  Object.fromEntries(TOGGLE_CONTROL_SCHEMA.map((def) => [def.key, def])) as Record<
    ToggleControlKey,
    ToggleControlDef
  >;

export const CONTROL_SCHEMA: ControlDef[] = [
  // ---- Feel ----
  {
    key: 'reactivity',
    label: 'Intensity',
    labelAutoGain: 'Intensity (trim)',
    min: 0.2,
    max: 4,
    step: 0.05,
    fallback: 1.1,
    hint: 'How big the visuals move with the audio',
    hintAutoGain: 'How big the visuals move — fine-tune on top of auto sensitivity',
    group: 'feel',
  },
  {
    key: 'energy',
    label: 'Punch',
    min: 0,
    max: 2,
    step: 0.05,
    fallback: 0.45,
    hint: 'Extra snap on hits — drums land harder without raising the quiet parts',
    group: 'feel',
  },
  {
    key: 'smoothness',
    label: 'Flow',
    min: 0,
    max: 0.95,
    step: 0.01,
    fallback: 0.6,
    hint: 'How silkily motion glides between hits — hits still land instantly',
    group: 'feel',
  },
  {
    key: 'linger',
    label: 'Linger',
    min: 0,
    max: 1,
    step: 0.01,
    fallback: 0.3,
    hint: 'How long big moments echo after they pass — hits still land instantly',
    group: 'feel',
  },
  {
    key: 'speed',
    label: 'Speed',
    min: 0.25,
    max: 3,
    step: 0.05,
    fallback: 1,
    hint: 'Pace of the motion',
    group: 'feel',
  },
  {
    key: 'anima',
    label: 'Life',
    min: 0,
    max: 1,
    step: 0.01,
    fallback: 0.5,
    hint: 'How alive the scene stays between beats — breathing, drifting attention',
    group: 'feel',
  },

  // ---- Color & light ----
  {
    key: 'colorLife',
    label: 'Color life',
    min: 0,
    max: 1,
    step: 0.01,
    fallback: 0.6,
    hint: 'Colors breathe with loudness, drift over time, and shift on drops',
    group: 'color',
  },
  {
    key: 'bloomIntensity',
    label: 'Glow',
    min: 0,
    max: 3,
    step: 0.05,
    fallback: 1,
    hint: 'Bloom around bright areas — swells with the music',
    group: 'color',
  },
  {
    key: 'lightLevel',
    label: 'Light',
    min: 0.2,
    max: 2,
    step: 0.05,
    fallback: 1,
    hint: 'Overall brightness of the world',
    group: 'color',
  },
  {
    key: 'aura',
    label: 'Aura',
    min: 0,
    max: 1,
    step: 0.01,
    fallback: 0.4,
    hint: 'Ambient wisp field around the scene',
    group: 'color',
  },

  // ---- Whole-frame effects ----
  {
    key: 'shaderMix',
    label: 'Shader wet',
    min: 0,
    max: 1,
    step: 0.01,
    fallback: 1,
    hint: '0 keeps the original frame; 1 applies the selected screen style fully',
    group: 'effects',
  },
  ...EMITTER_CONTROLS.map(
    (control): ControlDef => ({
      ...control,
      group: 'effects',
    }),
  ),

  // ---- Framing & camera ----
  {
    key: 'scale',
    label: 'Size',
    min: 0.2,
    max: 3,
    step: 0.05,
    fallback: 1,
    hint: 'How much of the frame the scene fills',
    group: 'framing',
  },
  {
    key: 'cameraDistance',
    label: 'Distance',
    min: 0.5,
    max: 2.5,
    step: 0.05,
    fallback: 1,
    hint: 'How far the camera sits from the center — it never gets close enough to clip into the scene',
    group: 'framing',
  },
  {
    key: 'bassShake',
    label: 'Shake',
    min: 0,
    max: 3,
    step: 0.05,
    fallback: 0,
    hint: 'Subwoofer camera rumble on heavy bass',
    group: 'framing',
  },
  {
    key: 'depthOfField',
    label: 'Depth of field',
    min: 0,
    max: 2,
    step: 0.05,
    fallback: 0,
    hint: 'Focus blur that kicks with heavy bass — pairs with Shake',
    group: 'framing',
  },
  {
    key: 'cinematicSpeed',
    label: 'Cinematic speed',
    min: 0.25,
    max: 3,
    step: 0.05,
    fallback: 1,
    hint: 'Playback rate of the auto-directed camera',
    group: 'framing',
    requiresCameraMode: 'cinematic',
  },

  // ---- Bands (advanced) ----
  {
    key: 'bassMix',
    label: 'Bass',
    min: 0,
    max: 4,
    step: 0.05,
    fallback: 1,
    hint: 'How much the low end drives the visuals',
    group: 'bands',
  },
  {
    key: 'midMix',
    label: 'Mid',
    min: 0,
    max: 4,
    step: 0.05,
    fallback: 1,
    hint: 'How much the mids drive the visuals',
    group: 'bands',
  },
  {
    key: 'highMix',
    label: 'High',
    min: 0,
    max: 4,
    step: 0.05,
    fallback: 1.05,
    hint: 'How much the highs drive the visuals',
    group: 'bands',
  },

  // ---- Per-preset (rendered when the active preset lists the key) ----
  {
    key: 'inflate',
    label: 'Inflate',
    min: 0,
    max: 1,
    step: 0.01,
    fallback: 0.55,
    hint: '0 = distinct stretching voices, 1 = plush fused choir',
    group: 'preset',
  },
  {
    key: 'appendages',
    label: 'Voices',
    min: 0,
    max: 10,
    step: 1,
    fallback: 5,
    hint: 'Persistent harmonic orbs in the lava choir',
    group: 'preset',
  },
  {
    key: 'subSpheres',
    label: 'Harmonics',
    min: 0,
    max: 8,
    step: 1,
    fallback: 5,
    hint: 'Transient high-frequency orbs on shimmer / hats',
    group: 'preset',
  },
  {
    key: 'turbulence',
    label: 'Turbulence',
    min: 0,
    max: 2,
    step: 0.05,
    fallback: 1,
    hint: 'Fine chaotic detail in the current',
    group: 'preset',
  },
  {
    key: 'trailLength',
    label: 'Trails',
    min: 0,
    max: 2,
    step: 0.05,
    fallback: 1,
    hint: 'How long each particle\u2019s ink trail is',
    group: 'preset',
  },
  {
    key: 'density',
    label: 'Density',
    min: 0.05,
    max: 1,
    step: 0.05,
    fallback: 1,
    hint: 'Fraction of the swarm that\u2019s visible',
    group: 'preset',
  },
  {
    key: 'vortexAmount',
    label: 'Vortex',
    min: 0,
    max: 1,
    step: 0.05,
    fallback: 0.25,
    hint: 'Tornado pull at the center of the field',
    group: 'preset',
  },
  {
    key: 'interactStrength',
    label: 'Stir',
    min: 0,
    max: 2,
    step: 0.05,
    fallback: 1,
    hint: 'How strongly your cursor stirs the current',
    group: 'preset',
  },
];

export const CONTROL_DEFS_BY_KEY: Readonly<Record<ControlKey, ControlDef>> = Object.fromEntries(
  CONTROL_SCHEMA.map((def) => [def.key, def]),
) as Record<ControlKey, ControlDef>;

export function controlsForGroup(group: ControlGroup): ControlDef[] {
  return CONTROL_SCHEMA.filter((def) => def.group === group);
}
