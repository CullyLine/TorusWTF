import type { MutableRefObject, ComponentType } from 'react';
import type { AudioMetrics } from '../metrics';
import type { DeviceTier } from '../tier';

/** Global emitter choices. Keep `none` serializable for old/new show files. */
export type EmitterKind = 'none' | 'bubbles';

/** Palette shape shared with the existing living-palette driver. */
export interface EmitterPalette {
  bass: string;
  mid: string;
  high: string;
}

/** Continuous values that can safely be driven by the modulation matrix. */
export interface EmitterContinuousSettings {
  /** Particles emitted per second. */
  rate: number;
  /** Point-sprite diameter multiplier. */
  size: number;
  /** Mean particle lifetime in seconds. */
  lifetime: number;
  /** Upward velocity multiplier. */
  lift: number;
  /** Spawn-area and initial lateral-velocity multiplier. */
  spread: number;
  /** Shared flow-field influence. */
  turbulence: number;
  /** Final material opacity. */
  opacity: number;
}

/**
 * Persistable settings for the one global emitter layer.
 *
 * `particleBudget` is a requested ceiling. The renderer always caps it to the
 * current device tier, so a high-tier show remains safe on a low-tier device.
 */
export interface EmitterSettings extends EmitterContinuousSettings {
  kind: EmitterKind;
  seed: number;
  particleBudget: number;
}

/** Fully clamped settings, including runtime-only tier and burst ceilings. */
export interface ResolvedEmitterSettings extends EmitterSettings {
  burstLimit: number;
}

export type EmitterSettingKey = keyof EmitterContinuousSettings;

/**
 * Names intentionally use an `emitter` prefix so they do not collide with
 * preset controls such as Flow Field's `turbulence`.
 */
export type EmitterControlKey =
  | 'emitterRate'
  | 'emitterSize'
  | 'emitterLifetime'
  | 'emitterLift'
  | 'emitterSpread'
  | 'emitterTurbulence'
  | 'emitterOpacity';

export interface EmitterControlDefinition {
  key: EmitterControlKey;
  setting: EmitterSettingKey;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  fallback: number;
}

/** Values written by the existing mutable-ref modulation convention. */
export type EmitterModulatedValues = Partial<Record<EmitterControlKey, number>>;
export type EmitterModulationRef = MutableRefObject<EmitterModulatedValues>;

/**
 * Structural subset of the future VisualImpulses shape. The active emitter
 * consumes a positive strength and writes it back to zero in the same frame.
 */
export interface EmitterImpulseSource {
  emitterBurst: number;
}

export interface EmitterRendererProps {
  settings: ResolvedEmitterSettings;
  palette: EmitterPalette;
  tier: DeviceTier;
  metricsRef: MutableRefObject<AudioMetrics>;
  modulationRef: EmitterModulationRef;
  impulses?: EmitterImpulseSource;
}

export interface EmitterDefinition {
  id: EmitterKind;
  label: string;
  hint: string;
  Renderer: ComponentType<EmitterRendererProps>;
  defaults: Readonly<EmitterSettings>;
  controls: readonly EmitterControlDefinition[];
  tierBudgets: Readonly<Record<DeviceTier, number>>;
  tierBurstLimits: Readonly<Record<DeviceTier, number>>;
}

/** Props needed by the single scene-graph emitter mount. */
export interface EmitterLayerProps {
  settings?: EmitterSettings | null;
  palette: EmitterPalette;
  tier: DeviceTier;
  impulses?: EmitterImpulseSource;
  /**
   * Optional adapter/testing override. In normal use the layer reads the
   * existing ModulationProvider ref and future emitter control keys directly.
   */
  modulationRef?: EmitterModulationRef;
}
