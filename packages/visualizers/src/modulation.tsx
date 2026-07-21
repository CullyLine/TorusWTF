'use client';

import { createContext, useContext, useRef, type MutableRefObject, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import type { AudioMetrics } from './metrics';
import { useMetricsRef } from './metrics';
import { CONTROL_DEFS_BY_KEY, type ControlKey } from './controlSchema';
import { EMITTER_CONTROL_KEYS } from './emitters/settings';
import { VISUALIZERS, type VisualizerId } from './registry';

/**
 * Modulation matrix — the synth-style routing layer that turns any audio
 * signal into a live driver for any visual control.
 *
 * A routing says: take SOURCE (a metric the analysis engine already
 * computes — vocals, kick envelope, song-peak level, afterglow…), shape it
 * through a CURVE, smooth it with a fast-attack / SmoothDamp-release
 * envelope (GLIDE), scale it by AMOUNT, and add it to the base value of
 * TARGET (any control from the schema — glow, size, speed, turbulence…).
 * The result is clamped to the control's own min/max so no routing can
 * push a value into broken territory.
 *
 * Runtime model: `ModulationDriver` runs one `useFrame` pass per frame,
 * writing final absolute values into a mutable ref shared through
 * `ModulationContext`. Consumers (SceneRig, presets, palette driver, the
 * scene-scale group) read `useModulation().current[key] ?? baseProp` inside
 * their own frame loops — no React re-renders, no allocation.
 */

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/** Metrics exposed as modulation sources (all numeric 0..~1.2). */
export type ModSourceKey =
  | 'bass'
  | 'mid'
  | 'high'
  | 'energy'
  | 'impact'
  | 'swell'
  | 'shimmer'
  | 'kick'
  | 'snare'
  | 'hat'
  | 'sectionLevel'
  | 'afterglow'
  | 'tension'
  | 'dropEvent'
  | 'vocalActivity'
  | 'leadActivity'
  | 'drumActivity'
  | 'bassActivity'
  | 'gather'
  | 'echo'
  | 'convergence'
  | 'silence';

export interface ModSourceDef {
  key: ModSourceKey;
  label: string;
  hint: string;
}

/**
 * The user-facing source list — ordered from "raw bands" to "musical
 * understanding" so the panel reads as a story, and doubles as the live
 * signal-meter list.
 */
export const MOD_SOURCES: ModSourceDef[] = [
  { key: 'bass', label: 'Bass', hint: 'Low-end level, right now' },
  { key: 'mid', label: 'Mids', hint: 'Mid-range level, right now' },
  { key: 'high', label: 'Highs', hint: 'Top-end level, right now' },
  { key: 'energy', label: 'Energy', hint: 'Full-spectrum loudness' },
  { key: 'impact', label: 'Hit', hint: 'Snaps on every hit, rings down like a struck bell' },
  { key: 'swell', label: 'Swell', hint: 'Slow loudness breath — rises fast, exhales over ~2s' },
  { key: 'shimmer', label: 'Sparkle', hint: 'Hi-hats, cymbals, and sibilance with a slow melt' },
  { key: 'kick', label: 'Kick drum', hint: 'Low-band transients — the actual kick pattern' },
  { key: 'snare', label: 'Snare', hint: 'Mid-band cracks with hat bleed subtracted' },
  { key: 'hat', label: 'Hi-hat', hint: 'Fast top-end ticks, clears before the next 16th' },
  { key: 'sectionLevel', label: 'Song peak', hint: 'How big this moment is vs. the whole song so far' },
  { key: 'afterglow', label: 'Afterglow', hint: 'Lingering warmth for seconds after a peak or drop' },
  { key: 'tension', label: 'Build-up', hint: 'Rising tension before a drop — sweeps, snare rolls' },
  { key: 'dropEvent', label: 'Drop', hint: 'Pulses when a bass drop lands, decays over ~2 beats' },
  { key: 'vocalActivity', label: 'Vocals', hint: 'How present a voice is (formant-range heuristic)' },
  { key: 'leadActivity', label: 'Lead / synths', hint: 'Sustained tonal instruments, vocals excluded' },
  { key: 'drumActivity', label: 'Drums', hint: 'Percussive transient density' },
  { key: 'bassActivity', label: 'Bassline', hint: 'Sustained low-end presence (smoother than Bass)' },
  { key: 'gather', label: 'Pre-beat', hint: 'The inhale just before each predicted beat' },
  { key: 'echo', label: 'Echo', hint: 'Replays the last phrase\u2019s rhythm into quiet gaps' },
  { key: 'convergence', label: 'Lock-in', hint: 'How locked-together the bands are — 1 in choruses' },
  { key: 'silence', label: 'Silence', hint: '1 during sustained quiet — great inverted (negative amount)' },
];

export const MOD_SOURCES_BY_KEY: Readonly<Record<ModSourceKey, ModSourceDef>> = Object.fromEntries(
  MOD_SOURCES.map((s) => [s.key, s]),
) as Record<ModSourceKey, ModSourceDef>;

// ---------------------------------------------------------------------------
// Routings
// ---------------------------------------------------------------------------

/** How the raw 0..1 source value is shaped before scaling. */
export type ModCurve = 'linear' | 'soft' | 'sharp' | 'gate';

export const MOD_CURVES: { key: ModCurve; label: string; hint: string }[] = [
  { key: 'linear', label: 'Linear', hint: 'Value maps straight through' },
  { key: 'soft', label: 'Soft', hint: 'Responds early — quiet detail counts' },
  { key: 'sharp', label: 'Sharp', hint: 'Only the peaks matter' },
  { key: 'gate', label: 'Gate', hint: 'Snaps on/off past the halfway point' },
];

export interface ModRouting {
  id: string;
  enabled: boolean;
  source: ModSourceKey;
  /** Any schema control key — validated against CONTROL_DEFS_BY_KEY at run time. */
  target: ControlKey;
  /**
   * -1..1 — fraction of the target's full slider range added at source = 1.
   * Negative amounts subtract (e.g. Silence → -Size shrinks in quiet).
   */
  amount: number;
  curve: ModCurve;
  /**
   * Release SmoothDamp time in seconds. Attack is always fast (~30ms) so
   * hits land; glide only stretches the critically-damped settle back down
   * — the per-routing "linger" with inertia, not a linear lag.
   */
  glide: number;
}

/**
 * Global controls that make good continuous targets. Analysis-side controls
 * (reactivity, smoothness, band mixes, linger) are deliberately excluded:
 * modulating the analyser with its own output is feedback, not expression.
 */
export const MOD_GLOBAL_TARGETS: ControlKey[] = [
  'speed',
  'scale',
  'bloomIntensity',
  'lightLevel',
  'shaderMix',
  'colorLife',
  'cameraDistance',
  'bassShake',
  'cinematicSpeed',
  ...EMITTER_CONTROL_KEYS,
];

/** Integer-stepped preset controls that would pop rather than glide. */
const NON_MODULATABLE: ReadonlySet<ControlKey> = new Set<ControlKey>(['appendages', 'subSpheres']);

/** Modulation targets for the active preset: globals + its own sliders. */
export function modTargetsForPreset(preset: VisualizerId): ControlKey[] {
  const presetKeys = (VISUALIZERS[preset]?.presetControls ?? []).filter(
    (key) => !NON_MODULATABLE.has(key),
  );
  return [...MOD_GLOBAL_TARGETS, ...presetKeys];
}

export function shapeModValue(value: number, curve: ModCurve): number {
  const v = value < 0 ? 0 : value > 1 ? 1 : value;
  switch (curve) {
    case 'soft':
      return Math.sqrt(v);
    case 'sharp':
      return v * v;
    case 'gate':
      return v > 0.5 ? 1 : 0;
    default:
      return v;
  }
}

/** Fast attack so kicks / hits land before the release spring takes over. */
const ATTACK_TAU = 0.03;

interface ModEnvelope {
  value: number;
  velocity: number;
}

/**
 * Unity-style SmoothDamp (critically damped). Mutates `state` in place.
 * No overshoot when velocity starts near zero — release settles with inertia
 * instead of a single-tau exponential lag.
 */
function smoothDampEnvelope(
  state: ModEnvelope,
  target: number,
  dt: number,
  smoothTime: number,
): number {
  const st = Math.max(1e-4, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = state.value - target;
  const temp = (state.velocity + omega * change) * dt;
  state.velocity = (state.velocity - omega * temp) * exp;
  state.value = target + (change + temp) * exp;
  // Envelope is a unipolar gate — never dip below 0 from residual velocity.
  if (state.value < 0) {
    state.value = 0;
    state.velocity = 0;
  }
  return state.value;
}

// ---------------------------------------------------------------------------
// Runtime: context + driver
// ---------------------------------------------------------------------------

export type ModulatedValues = Partial<Record<ControlKey, number>>;

const FALLBACK_MOD_REF: MutableRefObject<ModulatedValues> = { current: {} };

const ModulationContext = createContext<MutableRefObject<ModulatedValues>>(FALLBACK_MOD_REF);

/**
 * Per-frame modulated control values. `current[key]` is the final absolute
 * value (base + all routings, clamped to the control's range) — undefined
 * when nothing modulates that key, so consumers fall back to their prop.
 */
export function useModulation(): MutableRefObject<ModulatedValues> {
  return useContext(ModulationContext);
}

interface ModulationProviderProps {
  routings: ModRouting[] | undefined;
  /** Base control values from props/sliders — re-read every frame. */
  base: ModulatedValues;
  children: ReactNode;
}

/**
 * Owns the shared modulated-values ref and computes it every frame from the
 * routing list. Mounted once inside the canvas, inside AudioMetricsProvider.
 */
export function ModulationProvider({ routings, base, children }: ModulationProviderProps) {
  const metricsRef = useMetricsRef();
  const outRef = useRef<ModulatedValues>({});
  const routingsRef = useRef(routings);
  routingsRef.current = routings;
  const baseRef = useRef(base);
  baseRef.current = base;
  // Per-routing envelope spring (keyed by routing id). Pruned lazily.
  const envRef = useRef<Map<string, ModEnvelope>>(new Map());
  // Scratch offsets per target, reused across frames.
  const offsetsRef = useRef<Partial<Record<ControlKey, number>>>({});

  useFrame((_state, delta) => {
    const out = outRef.current;
    const list = routingsRef.current;
    if (!list || list.length === 0) {
      for (const key of Object.keys(out) as ControlKey[]) delete out[key];
      return;
    }

    const m: AudioMetrics = metricsRef.current;
    const dt = Math.min(delta, 0.1);
    const offsets = offsetsRef.current;
    for (const key of Object.keys(offsets) as ControlKey[]) delete offsets[key];

    const envs = envRef.current;
    for (const r of list) {
      if (!r.enabled) continue;
      const def = CONTROL_DEFS_BY_KEY[r.target];
      if (!def) continue;
      const raw = m[r.source];
      if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;

      const shaped = shapeModValue(raw, r.curve);
      let env = envs.get(r.id);
      if (!env) {
        env = { value: 0, velocity: 0 };
        envs.set(r.id, env);
      }
      // Fast attack so hits land; SmoothDamp release settles with inertia.
      if (shaped >= env.value) {
        env.value += (shaped - env.value) * (1 - Math.exp(-dt / ATTACK_TAU));
        // Kill residual spring velocity so release never rubber-bands past zero.
        env.velocity = 0;
      } else {
        smoothDampEnvelope(env, shaped, dt, Math.max(ATTACK_TAU, r.glide));
      }

      const range = def.max - def.min;
      offsets[r.target] = (offsets[r.target] ?? 0) + env.value * r.amount * range;
    }

    // Prune envelope state for deleted routings (cheap: only when counts drift).
    if (envs.size > list.length * 2) {
      const liveIds = new Set(list.map((r) => r.id));
      for (const id of envs.keys()) if (!liveIds.has(id)) envs.delete(id);
    }

    // Offsets → absolute clamped values; clear stale outputs.
    const baseVals = baseRef.current;
    for (const key of Object.keys(out) as ControlKey[]) {
      if (!(key in offsets)) delete out[key];
    }
    for (const key of Object.keys(offsets) as ControlKey[]) {
      const def = CONTROL_DEFS_BY_KEY[key];
      const b = baseVals[key] ?? def.fallback;
      const v = b + offsets[key]!;
      out[key] = v < def.min ? def.min : v > def.max ? def.max : v;
    }
  });

  return <ModulationContext.Provider value={outRef}>{children}</ModulationContext.Provider>;
}

// ---------------------------------------------------------------------------
// Validation (persistence / show files)
// ---------------------------------------------------------------------------

const MOD_CURVE_KEYS = new Set<string>(MOD_CURVES.map((c) => c.key));
const MOD_SOURCE_KEYS = new Set<string>(MOD_SOURCES.map((s) => s.key));

export function isValidModRouting(value: unknown): value is ModRouting {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.enabled === 'boolean' &&
    typeof r.source === 'string' &&
    MOD_SOURCE_KEYS.has(r.source) &&
    typeof r.target === 'string' &&
    r.target in CONTROL_DEFS_BY_KEY &&
    typeof r.amount === 'number' &&
    Number.isFinite(r.amount) &&
    r.amount >= -1 &&
    r.amount <= 1 &&
    typeof r.curve === 'string' &&
    MOD_CURVE_KEYS.has(r.curve) &&
    typeof r.glide === 'number' &&
    Number.isFinite(r.glide) &&
    r.glide >= 0 &&
    r.glide <= 5
  );
}

export function sanitizeModRoutings(value: unknown): ModRouting[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isValidModRouting);
}
