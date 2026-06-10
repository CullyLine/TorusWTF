'use client';

import { forwardRef, useMemo } from 'react';
import { Effect } from 'postprocessing';
import { Uniform } from 'three';

/**
 * Multiplicative exposure ("Light level") applied after bloom. Unlike
 * `toneMappingExposure` (which custom fragment-shader presets bypass) or
 * additive brightness (which washes blacks out), this scales every pixel
 * uniformly, so it dims/boosts mesh presets and fullscreen-shader presets
 * identically.
 */

const fragmentShader = /* glsl */ `
uniform float level;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  outputColor = vec4(inputColor.rgb * level, inputColor.a);
}
`;

class LightLevelEffectImpl extends Effect {
  constructor(level = 1) {
    super('LightLevelEffect', fragmentShader, {
      uniforms: new Map<string, Uniform>([['level', new Uniform(level)]]),
    });
  }

  set level(value: number) {
    this.uniforms.get('level')!.value = value;
  }
}

export const LightLevel = forwardRef<LightLevelEffectImpl, { level?: number }>(
  function LightLevel({ level = 1 }, ref) {
    const effect = useMemo(() => new LightLevelEffectImpl(level), []);
    effect.level = level;
    return <primitive ref={ref} object={effect} dispose={null} />;
  },
);
