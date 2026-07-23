import { Color, Uniform, Vector2, type Texture } from 'three';
import type { AudioMetrics } from '../../metrics';
import type { DeviceTier } from '../../tier';

/** Compile-time / runtime tier encoding shared with GLSL `uniform float tier`. */
export const SCREEN_TIER_VALUE: Readonly<Record<DeviceTier, number>> = {
  low: 0,
  mid: 1,
  high: 2,
};

/** Stable float/audio keys on the screen-style uniform bus. */
export const SCREEN_AUDIO_UNIFORM_KEYS = [
  'audioBass',
  'audioMid',
  'audioHigh',
  'energy',
  'impact',
  'swell',
  'shimmer',
  'kick',
  'snare',
  'hat',
  'sectionLevel',
  'afterglow',
  'silence',
  'tension',
  'dropEvent',
  'release',
  'tenderness',
  'gather',
  'convergence',
] as const;

export type ScreenAudioUniformKey = (typeof SCREEN_AUDIO_UNIFORM_KEYS)[number];

/** Every uniform name every screen shader module may read. */
export const SCREEN_UNIFORM_KEYS = [
  'mixAmount',
  'time',
  'resolution',
  'colorBass',
  'colorMid',
  'colorHigh',
  ...SCREEN_AUDIO_UNIFORM_KEYS,
  'sceneDepth',
  'depthTexel',
  'cameraNear',
  'cameraFar',
  'tier',
] as const;

export type ScreenUniformKey = (typeof SCREEN_UNIFORM_KEYS)[number];

export type ScreenUniformMap = Map<string, Uniform>;

export interface ScreenPaletteColors {
  bass: string;
  mid: string;
  high: string;
}

/**
 * Per-frame inputs for the shared contract. Callers must reuse this object
 * (or call with stack locals) — updates never allocate Colors/Vectors.
 */
export interface ScreenUniformFrameInput {
  time: number;
  mixAmount: number;
  palette: ScreenPaletteColors;
  metrics: AudioMetrics;
  cameraNear: number;
  cameraFar: number;
}

function boundedMetric(value: number, ceiling: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(ceiling, Math.max(0, value));
}

export function createScreenUniformMap(
  mixAmount: number,
  tier: DeviceTier,
  depthTexture: Texture | null,
  cameraNear: number,
  cameraFar: number,
  depthTextureSize: number,
): ScreenUniformMap {
  return new Map<string, Uniform>([
    ['mixAmount', new Uniform(mixAmount)],
    ['time', new Uniform(0)],
    ['resolution', new Uniform(new Vector2(1, 1))],
    ['colorBass', new Uniform(new Color(1, 1, 1))],
    ['colorMid', new Uniform(new Color(1, 1, 1))],
    ['colorHigh', new Uniform(new Color(1, 1, 1))],
    ['audioBass', new Uniform(0)],
    ['audioMid', new Uniform(0)],
    ['audioHigh', new Uniform(0)],
    ['energy', new Uniform(0)],
    ['impact', new Uniform(0)],
    ['swell', new Uniform(0)],
    ['shimmer', new Uniform(0)],
    ['kick', new Uniform(0)],
    ['snare', new Uniform(0)],
    ['hat', new Uniform(0)],
    ['sectionLevel', new Uniform(0)],
    ['afterglow', new Uniform(0)],
    ['silence', new Uniform(0)],
    ['tension', new Uniform(0)],
    ['dropEvent', new Uniform(0)],
    ['release', new Uniform(0)],
    ['tenderness', new Uniform(0)],
    ['gather', new Uniform(0)],
    ['convergence', new Uniform(0)],
    ['sceneDepth', new Uniform(depthTexture)],
    [
      'depthTexel',
      new Uniform(new Vector2(1 / depthTextureSize, 1 / depthTextureSize)),
    ],
    ['cameraNear', new Uniform(cameraNear)],
    ['cameraFar', new Uniform(cameraFar)],
    ['tier', new Uniform(SCREEN_TIER_VALUE[tier])],
  ]);
}

/** Write the shared frame contract into an existing uniform map (no allocations). */
export function writeScreenUniformFrame(
  uniforms: ScreenUniformMap,
  input: ScreenUniformFrameInput,
): void {
  uniforms.get('mixAmount')!.value = input.mixAmount;
  uniforms.get('time')!.value = Number.isFinite(input.time) ? Math.max(0, input.time) : 0;

  (uniforms.get('colorBass')!.value as Color).set(input.palette.bass);
  (uniforms.get('colorMid')!.value as Color).set(input.palette.mid);
  (uniforms.get('colorHigh')!.value as Color).set(input.palette.high);

  const m = input.metrics;
  // The core metrics intentionally retain headroom up to 10 for mesh scenes.
  // Screen-space warps need a tighter contract so max gain cannot collapse
  // every sample to an edge or flood the frame with additive color.
  uniforms.get('audioBass')!.value = boundedMetric(m.bass, 2);
  uniforms.get('audioMid')!.value = boundedMetric(m.mid, 2);
  uniforms.get('audioHigh')!.value = boundedMetric(m.high, 2);
  uniforms.get('energy')!.value = boundedMetric(m.energy, 2);
  uniforms.get('impact')!.value = boundedMetric(m.impact, 1.5);
  uniforms.get('swell')!.value = boundedMetric(m.swell, 1);
  uniforms.get('shimmer')!.value = boundedMetric(m.shimmer, 1);
  uniforms.get('kick')!.value = boundedMetric(m.kick, 1.5);
  uniforms.get('snare')!.value = boundedMetric(m.snare, 1.5);
  uniforms.get('hat')!.value = boundedMetric(m.hat, 1.5);
  uniforms.get('sectionLevel')!.value = boundedMetric(m.sectionLevel, 1);
  uniforms.get('afterglow')!.value = boundedMetric(m.afterglow, 1);
  uniforms.get('silence')!.value = boundedMetric(m.silence, 1);
  uniforms.get('tension')!.value = boundedMetric(m.tension, 1);
  uniforms.get('dropEvent')!.value = boundedMetric(m.dropEvent, 1);
  uniforms.get('release')!.value = boundedMetric(m.release, 1);
  uniforms.get('tenderness')!.value = boundedMetric(m.tenderness, 1);
  uniforms.get('gather')!.value = boundedMetric(m.gather, 1);
  uniforms.get('convergence')!.value = boundedMetric(m.convergence, 1);

  uniforms.get('cameraNear')!.value = input.cameraNear;
  uniforms.get('cameraFar')!.value = input.cameraFar;
}

export function writeScreenResolution(
  uniforms: ScreenUniformMap,
  width: number,
  height: number,
): void {
  (uniforms.get('resolution')!.value as Vector2).set(Math.max(1, width), Math.max(1, height));
}

export function writeScreenDepthTexture(
  uniforms: ScreenUniformMap,
  depthTexture: Texture | null,
): void {
  uniforms.get('sceneDepth')!.value = depthTexture;
}
