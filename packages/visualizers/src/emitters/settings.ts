import type { DeviceTier } from '../tier';
import type {
  EmitterContinuousSettings,
  EmitterControlDefinition,
  EmitterControlKey,
  EmitterModulatedValues,
  EmitterSettings,
  ResolvedEmitterSettings,
} from './types';

export const BUBBLE_TIER_BUDGETS: Readonly<Record<DeviceTier, number>> = Object.freeze({
  low: 192,
  mid: 512,
  high: 1200,
});

export const BUBBLE_TIER_BURST_LIMITS: Readonly<Record<DeviceTier, number>> = Object.freeze({
  low: 48,
  mid: 144,
  high: 320,
});

export const EMITTER_CONTROLS: readonly EmitterControlDefinition[] = Object.freeze([
  {
    key: 'emitterRate',
    setting: 'rate',
    label: 'Rate',
    hint: 'Bubbles emitted per second',
    min: 0,
    max: 120,
    step: 1,
    fallback: 14,
  },
  {
    key: 'emitterSize',
    setting: 'size',
    label: 'Size',
    hint: 'Bubble diameter',
    min: 0.2,
    max: 2.5,
    step: 0.05,
    fallback: 0.9,
  },
  {
    key: 'emitterLifetime',
    setting: 'lifetime',
    label: 'Lifetime',
    hint: 'Seconds before a bubble fades',
    min: 1,
    max: 20,
    step: 0.25,
    fallback: 8,
  },
  {
    key: 'emitterLift',
    setting: 'lift',
    label: 'Lift',
    hint: 'Upward buoyancy',
    min: 0,
    max: 3,
    step: 0.05,
    fallback: 1,
  },
  {
    key: 'emitterSpread',
    setting: 'spread',
    label: 'Spread',
    hint: 'Spawn width and sideways drift',
    min: 0,
    max: 3,
    step: 0.05,
    fallback: 1,
  },
  {
    key: 'emitterTurbulence',
    setting: 'turbulence',
    label: 'Turbulence',
    hint: 'Shared flow-field influence',
    min: 0,
    max: 2,
    step: 0.05,
    fallback: 0.45,
  },
  {
    key: 'emitterOpacity',
    setting: 'opacity',
    label: 'Opacity',
    hint: 'Bubble body and rim visibility',
    min: 0,
    max: 1,
    step: 0.01,
    fallback: 0.72,
  },
]);

export const EMITTER_CONTROL_KEYS: readonly EmitterControlKey[] = Object.freeze(
  EMITTER_CONTROLS.map((control) => control.key),
);

export const EMITTER_CONTROLS_BY_KEY: Readonly<
  Record<EmitterControlKey, EmitterControlDefinition>
> = Object.freeze(
  Object.fromEntries(EMITTER_CONTROLS.map((control) => [control.key, control])) as Record<
    EmitterControlKey,
    EmitterControlDefinition
  >,
);

const CONTROL_BY_SETTING: Readonly<
  Record<keyof EmitterContinuousSettings, EmitterControlDefinition>
> = Object.freeze(
  Object.fromEntries(EMITTER_CONTROLS.map((control) => [control.setting, control])) as Record<
    keyof EmitterContinuousSettings,
    EmitterControlDefinition
  >,
);

const BUBBLE_DEFAULT_VALUES: Omit<EmitterSettings, 'kind'> = {
  seed: 0x0b0bb1e5,
  particleBudget: BUBBLE_TIER_BUDGETS.high,
  rate: CONTROL_BY_SETTING.rate.fallback,
  size: CONTROL_BY_SETTING.size.fallback,
  lifetime: CONTROL_BY_SETTING.lifetime.fallback,
  lift: CONTROL_BY_SETTING.lift.fallback,
  spread: CONTROL_BY_SETTING.spread.fallback,
  turbulence: CONTROL_BY_SETTING.turbulence.fallback,
  opacity: CONTROL_BY_SETTING.opacity.fallback,
};

/** Factory state: the layer is disabled, with bubble controls ready to use. */
export const DEFAULT_EMITTER_SETTINGS: Readonly<EmitterSettings> = Object.freeze({
  kind: 'none',
  ...BUBBLE_DEFAULT_VALUES,
});

/** Defaults applied when the user selects the first concrete emitter. */
export const DEFAULT_BUBBLE_EMITTER_SETTINGS: Readonly<EmitterSettings> = Object.freeze({
  kind: 'bubbles',
  ...BUBBLE_DEFAULT_VALUES,
});

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function sanitizeContinuousValue(setting: keyof EmitterContinuousSettings, value: unknown): number {
  const def = CONTROL_BY_SETTING[setting];
  return clamp(finiteNumber(value, def.fallback), def.min, def.max);
}

/** Defensive parser for persisted settings and projector payloads. */
export function sanitizeEmitterSettings(value: unknown): EmitterSettings {
  const source =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const kind = source.kind === 'bubbles' ? 'bubbles' : 'none';
  const rawSeed = finiteNumber(source.seed, DEFAULT_EMITTER_SETTINGS.seed);
  const rawBudget = finiteNumber(source.particleBudget, DEFAULT_EMITTER_SETTINGS.particleBudget);

  return {
    kind,
    seed: Math.trunc(rawSeed) >>> 0,
    particleBudget: Math.floor(clamp(rawBudget, 1, BUBBLE_TIER_BUDGETS.high)),
    rate: sanitizeContinuousValue('rate', source.rate),
    size: sanitizeContinuousValue('size', source.size),
    lifetime: sanitizeContinuousValue('lifetime', source.lifetime),
    lift: sanitizeContinuousValue('lift', source.lift),
    spread: sanitizeContinuousValue('spread', source.spread),
    turbulence: sanitizeContinuousValue('turbulence', source.turbulence),
    opacity: sanitizeContinuousValue('opacity', source.opacity),
  };
}

/** Apply the device ceiling without changing the persistable requested budget. */
export function resolveEmitterSettings(
  value: EmitterSettings | null | undefined,
  tier: DeviceTier,
): ResolvedEmitterSettings {
  const settings = sanitizeEmitterSettings(value);
  const particleBudget = Math.min(settings.particleBudget, BUBBLE_TIER_BUDGETS[tier]);
  return {
    ...settings,
    particleBudget,
    burstLimit: Math.min(particleBudget, BUBBLE_TIER_BURST_LIMITS[tier]),
  };
}

/**
 * Resolve live modulation into a caller-owned object. Mutating `out` keeps
 * the render loop allocation-free.
 */
export function resolveEmitterRuntimeSettings(
  base: EmitterContinuousSettings,
  modulated: EmitterModulatedValues,
  out: EmitterContinuousSettings,
): EmitterContinuousSettings {
  out.rate = sanitizeContinuousValue('rate', modulated.emitterRate ?? base.rate);
  out.size = sanitizeContinuousValue('size', modulated.emitterSize ?? base.size);
  out.lifetime = sanitizeContinuousValue('lifetime', modulated.emitterLifetime ?? base.lifetime);
  out.lift = sanitizeContinuousValue('lift', modulated.emitterLift ?? base.lift);
  out.spread = sanitizeContinuousValue('spread', modulated.emitterSpread ?? base.spread);
  out.turbulence = sanitizeContinuousValue(
    'turbulence',
    modulated.emitterTurbulence ?? base.turbulence,
  );
  out.opacity = sanitizeContinuousValue('opacity', modulated.emitterOpacity ?? base.opacity);
  return out;
}
