'use client';

import { forwardRef, useEffect, useMemo } from 'react';
import { BlendFunction, Effect } from 'postprocessing';
import { Uniform } from 'three';
import { HIGHLIGHT_GUARD_KNEE, HIGHLIGHT_GUARD_THRESHOLD } from './brightness';

const fragmentShader = /* glsl */ `
uniform float threshold;
uniform float knee;
uniform float protectionEnabled;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (protectionEnabled < 0.5) {
    outputColor = inputColor;
    return;
  }

  float peak = max(max(inputColor.r, inputColor.g), max(inputColor.b, 0.0));
  if (peak <= threshold) {
    outputColor = inputColor;
    return;
  }

  float safeKnee = max(knee, 0.0001);
  float excess = peak - threshold;
  float compressedPeak = threshold + excess / (1.0 + excess / safeKnee);
  outputColor = vec4(inputColor.rgb * (compressedPeak / peak), inputColor.a);
}
`;

/** Final-frame, hue-preserving soft-knee highlight compression. */
export class HighlightGuardEffectImpl extends Effect {
  constructor(threshold = HIGHLIGHT_GUARD_THRESHOLD, knee = HIGHLIGHT_GUARD_KNEE, enabled = true) {
    super('HighlightGuardEffect', fragmentShader, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, Uniform>([
        ['threshold', new Uniform(threshold)],
        ['knee', new Uniform(knee)],
        ['protectionEnabled', new Uniform(enabled ? 1 : 0)],
      ]),
    });
  }

  set threshold(value: number) {
    this.uniforms.get('threshold')!.value = value;
  }

  set knee(value: number) {
    this.uniforms.get('knee')!.value = value;
  }

  set enabled(value: boolean) {
    this.uniforms.get('protectionEnabled')!.value = value ? 1 : 0;
  }
}

export const HighlightGuard = forwardRef<
  HighlightGuardEffectImpl,
  { threshold?: number; knee?: number; enabled?: boolean }
>(function HighlightGuard(
  { threshold = HIGHLIGHT_GUARD_THRESHOLD, knee = HIGHLIGHT_GUARD_KNEE, enabled = true },
  ref,
) {
  const effect = useMemo(() => new HighlightGuardEffectImpl(threshold, knee, enabled), []);
  effect.threshold = threshold;
  effect.knee = knee;
  effect.enabled = enabled;
  useEffect(() => () => effect.dispose(), [effect]);
  return <primitive ref={ref} object={effect} dispose={null} />;
});
