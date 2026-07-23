import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';
import type { Texture } from 'three';
import type { AudioMetrics } from '../metrics';
import type { DeviceTier } from '../tier';
import {
  clampScreenEffectMix,
  isCreativeScreenEffectId,
  type CreativeScreenEffectId,
  type ScreenEffectId,
} from './screenEffects';
import { buildScreenFragmentShader } from './screenShaders/registry';
import {
  createScreenUniformMap,
  writeScreenResolution,
  writeScreenUniformFrame,
  type ScreenPaletteColors,
  type ScreenUniformMap,
} from './screenShaders/uniforms';

export interface ScreenStyleFrameUpdate {
  time: number;
  palette: ScreenPaletteColors;
  metrics: AudioMetrics;
  cameraNear: number;
  cameraFar: number;
}

/**
 * One composer effect that compiles a single selected screen-style module.
 * Remount / reconstruct when `style` or `tier` changes — the fragment source
 * is fixed at construction time.
 */
export class ScreenStyleEffect extends Effect {
  private readonly currentStyle: CreativeScreenEffectId;
  private readonly currentTier: DeviceTier;
  private currentMix: number;
  private readonly screenUniforms: ScreenUniformMap;

  constructor(
    style: ScreenEffectId = 'matrix',
    mix = 1,
    tier: DeviceTier = 'high',
    depthTexture: Texture | null = null,
    cameraNear = 0.1,
    cameraFar = 1000,
    depthTextureSize = 384,
  ) {
    const creativeStyle: CreativeScreenEffectId = isCreativeScreenEffectId(style)
      ? style
      : 'matrix';
    const safeMix = clampScreenEffectMix(mix);
    const uniforms = createScreenUniformMap(
      safeMix,
      tier,
      depthTexture,
      cameraNear,
      cameraFar,
      depthTextureSize,
    );
    const fragmentShader = buildScreenFragmentShader(creativeStyle, tier);

    super('ScreenStyleEffect', fragmentShader, {
      attributes: EffectAttribute.CONVOLUTION,
      blendFunction: BlendFunction.SRC,
      uniforms,
    });

    this.currentStyle = creativeStyle;
    this.currentTier = tier;
    this.currentMix = safeMix;
    this.screenUniforms = uniforms;
  }

  get style(): CreativeScreenEffectId {
    return this.currentStyle;
  }

  get tier(): DeviceTier {
    return this.currentTier;
  }

  get mix(): number {
    return this.currentMix;
  }

  set mix(value: number) {
    const safeMix = clampScreenEffectMix(value);
    if (safeMix === this.currentMix) return;
    this.currentMix = safeMix;
    this.screenUniforms.get('mixAmount')!.value = safeMix;
  }

  set time(value: number) {
    this.screenUniforms.get('time')!.value = Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  /** Write palette + audio + camera range for the current frame (no allocations). */
  updateFrame(update: ScreenStyleFrameUpdate): void {
    writeScreenUniformFrame(this.screenUniforms, {
      time: update.time,
      mixAmount: this.currentMix,
      palette: update.palette,
      metrics: update.metrics,
      cameraNear: update.cameraNear,
      cameraFar: update.cameraFar,
    });
  }

  override setSize(width: number, height: number): void {
    writeScreenResolution(this.screenUniforms, width, height);
  }

  setCameraRange(near: number, far: number): void {
    this.screenUniforms.get('cameraNear')!.value = near;
    this.screenUniforms.get('cameraFar')!.value = far;
  }
}
