'use client';

import { forwardRef, useEffect, useMemo } from 'react';
import { BlendFunction, Effect } from 'postprocessing';
import { Uniform } from 'three';
import { DEFAULT_SATURATION, DISPLAY_TRANSFORM_GLSL, LOOK_EXPOSURE } from './displayTransform';

/**
 * The final scene-referred to display-referred stage. Runs last, after bloom,
 * vignette and any screen style, because everything before it is still
 * working in open-ended light.
 *
 * Grain is applied after the curve. Big smooth gradients (storm cloud, sun
 * glow, fog) quantise into visible bands at 8 bits; a sub-code-value of noise
 * dithers those boundaries away. It is strongest through the mid-tones and
 * fades out at both ends, so it never speckles a black background or dirties
 * a highlight.
 */

const fragmentShader = /* glsl */ `
uniform float exposure;
uniform float filmic;
uniform float grain;
uniform float saturation;

${DISPLAY_TRANSFORM_GLSL}

float torusGrainNoise(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 color = max(inputColor.rgb, vec3(0.0)) * exposure;

  vec3 mapped = filmic > 0.5 ? torusAcesFilmic(color) : torusNeutralClamp(color);
  mapped = torusSaturate(mapped, saturation);

  if (grain > 0.0) {
    // Two decorrelated samples per pixel keep the pattern from crawling in a
    // fixed direction as time advances.
    vec2 seed = gl_FragCoord.xy + vec2(fract(time * 61.0) * 443.0, fract(time * 37.0) * 719.0);
    float n = torusGrainNoise(seed) - 0.5;
    float luma = dot(mapped, vec3(0.2126, 0.7152, 0.0722));
    // Peaks at mid grey, vanishes at black and white.
    float shape = 4.0 * luma * (1.0 - luma);
    mapped += n * grain * shape;
  }

  outputColor = vec4(clamp(mapped, 0.0, 1.0), inputColor.a);
}
`;

export interface LookOptions {
  /** User light level; scaled by `LOOK_EXPOSURE` to anchor the curve. */
  level?: number;
  /** ACES filmic shoulder when true, neutral peak clamp when false. */
  filmic?: boolean;
  /** Grain amplitude in display units. ~1/255 is one code value. */
  grain?: number;
  /** Post-curve chroma. 1 = neutral. */
  saturation?: number;
}

/** Roughly half a code value: enough to break up banding, invisible as noise. */
export const DEFAULT_GRAIN = 0.002;

export class LookEffectImpl extends Effect {
  constructor({
    level = 1,
    filmic = true,
    grain = DEFAULT_GRAIN,
    saturation = DEFAULT_SATURATION,
  }: LookOptions = {}) {
    super('LookEffect', fragmentShader, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, Uniform>([
        ['exposure', new Uniform(level * LOOK_EXPOSURE)],
        ['filmic', new Uniform(filmic ? 1 : 0)],
        ['grain', new Uniform(grain)],
        ['saturation', new Uniform(saturation)],
      ]),
    });
  }

  set level(value: number) {
    this.uniforms.get('exposure')!.value = Math.max(0, value) * LOOK_EXPOSURE;
  }

  set filmic(value: boolean) {
    this.uniforms.get('filmic')!.value = value ? 1 : 0;
  }

  set grain(value: number) {
    this.uniforms.get('grain')!.value = Math.max(0, value);
  }

  set saturation(value: number) {
    this.uniforms.get('saturation')!.value = Math.max(0, value);
  }
}

export const Look = forwardRef<LookEffectImpl, LookOptions>(function Look(
  { level = 1, filmic = true, grain = DEFAULT_GRAIN, saturation = DEFAULT_SATURATION },
  ref,
) {
  const effect = useMemo(() => new LookEffectImpl({ level, filmic, grain, saturation }), []);
  effect.level = level;
  effect.filmic = filmic;
  effect.grain = grain;
  effect.saturation = saturation;
  useEffect(() => () => effect.dispose(), [effect]);
  return <primitive ref={ref} object={effect} dispose={null} />;
});
