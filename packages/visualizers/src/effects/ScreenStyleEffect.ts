import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';
import { Uniform, Vector2, type Texture } from 'three';
import type { ScreenEffectId } from './screenEffects';
import { clampScreenEffectMix } from './screenEffects';

const STYLE_MODE: Readonly<Record<ScreenEffectId, number>> = {
  none: 0,
  matrix: 1,
  pixel8: 2,
  cartoon: 3,
};

const fragmentShader = /* glsl */ `
uniform float styleMode;
uniform float mixAmount;
uniform float time;
uniform vec2 resolution;
uniform sampler2D sceneDepth;
uniform vec2 depthTexel;
uniform float cameraNear;
uniform float cameraFar;

float screenLuma(const in vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

float colorEdge(const in vec4 center, const in vec2 uv) {
  vec2 texel = 1.0 / max(resolution, vec2(1.0));
  float left = screenLuma(texture2D(inputBuffer, uv - vec2(texel.x, 0.0)).rgb);
  float right = screenLuma(texture2D(inputBuffer, uv + vec2(texel.x, 0.0)).rgb);
  float down = screenLuma(texture2D(inputBuffer, uv - vec2(0.0, texel.y)).rgb);
  float up = screenLuma(texture2D(inputBuffer, uv + vec2(0.0, texel.y)).rgb);
  float centerLuma = screenLuma(center.rgb);
  float laplacian = abs(left + right + down + up - 4.0 * centerLuma);
  float gradient = abs(left - right) + abs(down - up);
  return smoothstep(0.07, 0.38, gradient + laplacian * 0.45);
}

float viewDistance(const in vec2 uv) {
  float depth = texture2D(sceneDepth, uv).r;
  return (cameraNear * cameraFar)
    / max(cameraFar - depth * (cameraFar - cameraNear), 0.0001);
}

float depthEdge(const in vec2 uv) {
  float center = viewDistance(uv);
  float left = viewDistance(uv - vec2(depthTexel.x, 0.0));
  float right = viewDistance(uv + vec2(depthTexel.x, 0.0));
  float down = viewDistance(uv - vec2(0.0, depthTexel.y));
  float up = viewDistance(uv + vec2(0.0, depthTexel.y));
  float relativeDelta = max(
    max(abs(left - center), abs(right - center)),
    max(abs(down - center), abs(up - center))
  ) / max(center, 1.0);
  return smoothstep(0.012, 0.18, relativeDelta);
}

float bayer4(const in vec2 cell) {
  vec2 p = mod(floor(cell), 4.0);
  if (p.y < 0.5) {
    if (p.x < 0.5) return 0.0;
    if (p.x < 1.5) return 8.0;
    if (p.x < 2.5) return 2.0;
    return 10.0;
  }
  if (p.y < 1.5) {
    if (p.x < 0.5) return 12.0;
    if (p.x < 1.5) return 4.0;
    if (p.x < 2.5) return 14.0;
    return 6.0;
  }
  if (p.y < 2.5) {
    if (p.x < 0.5) return 3.0;
    if (p.x < 1.5) return 11.0;
    if (p.x < 2.5) return 1.0;
    return 9.0;
  }
  if (p.x < 0.5) return 15.0;
  if (p.x < 1.5) return 7.0;
  if (p.x < 2.5) return 13.0;
  return 5.0;
}

vec3 matrixStyle(const in vec4 inputColor, const in vec2 uv) {
  float luma = screenLuma(max(inputColor.rgb, vec3(0.0)));
  float edge = max(colorEdge(inputColor, uv), depthEdge(uv));
  vec2 pixel = uv * max(resolution, vec2(1.0));
  float scan = 0.84 + 0.16 * sin(pixel.y * 1.55 + time * 8.0);
  float gridX = smoothstep(0.92, 1.0, abs(sin(pixel.x * 0.19)));
  float gridY = smoothstep(0.94, 1.0, abs(sin(pixel.y * 0.19 - time * 0.9)));
  float column = 0.5 + 0.5 * sin(floor(pixel.x / 12.0) * 17.13 + time * 2.4);
  float rain = pow(max(0.0, sin(uv.y * 42.0 - time * (2.0 + column * 3.0))), 10.0);
  float signal = clamp(
    luma * 0.62 + edge * 1.15 + (gridX + gridY) * 0.055 + rain * 0.12,
    0.0,
    1.0
  );
  return vec3(0.004, signal * scan, 0.035 + signal * 0.31);
}

vec3 pixel8Style(const in vec2 uv) {
  vec2 safeResolution = max(resolution, vec2(1.0));
  vec2 blockSize = vec2(6.0);
  vec2 blockUv = blockSize / safeResolution;
  vec2 cell = floor(uv / blockUv);
  vec2 sampleUv = clamp((cell + 0.5) * blockUv, vec2(0.0), vec2(1.0));
  vec3 sampled = clamp(texture2D(inputBuffer, sampleUv).rgb, 0.0, 1.0);
  float dither = (bayer4(cell) - 7.5) / 16.0;
  const float levels = 6.0;
  return clamp(floor(sampled * (levels - 1.0) + 0.5 + dither) / (levels - 1.0), 0.0, 1.0);
}

vec3 cartoonStyle(const in vec4 inputColor, const in vec2 uv) {
  vec3 color = clamp(inputColor.rgb, 0.0, 1.0);
  const float levels = 5.0;
  vec3 posterized = floor(color * levels + 0.5) / levels;
  float gray = screenLuma(posterized);
  posterized = clamp(mix(vec3(gray), posterized, 1.18), 0.0, 1.0);
  float outline = max(colorEdge(inputColor, uv), depthEdge(uv));
  return posterized * (1.0 - smoothstep(0.18, 0.72, outline) * 0.9);
}

void mainImage(
  const in vec4 inputColor,
  const in vec2 uv,
  out vec4 outputColor
) {
  float wet = clamp(mixAmount, 0.0, 1.0);
  if (styleMode < 0.5 || wet <= 0.001) {
    outputColor = inputColor;
    return;
  }

  vec3 styled;
  if (styleMode < 1.5) {
    styled = matrixStyle(inputColor, uv);
  } else if (styleMode < 2.5) {
    styled = pixel8Style(uv);
  } else {
    styled = cartoonStyle(inputColor, uv);
  }

  outputColor = vec4(mix(inputColor.rgb, styled, wet), inputColor.a);
}
`;

/** One composer effect that hosts all mutually-exclusive whole-frame styles. */
export class ScreenStyleEffect extends Effect {
  private currentStyle: ScreenEffectId;
  private currentMix: number;

  constructor(
    style: ScreenEffectId = 'none',
    mix = 1,
    depthTexture: Texture | null = null,
    cameraNear = 0.1,
    cameraFar = 1000,
    depthTextureSize = 384,
  ) {
    const safeMix = clampScreenEffectMix(mix);
    super('ScreenStyleEffect', fragmentShader, {
      attributes: EffectAttribute.CONVOLUTION,
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, Uniform>([
        ['styleMode', new Uniform(STYLE_MODE[style])],
        ['mixAmount', new Uniform(safeMix)],
        ['time', new Uniform(0)],
        ['resolution', new Uniform(new Vector2(1, 1))],
        ['sceneDepth', new Uniform(depthTexture)],
        [
          'depthTexel',
          new Uniform(new Vector2(1 / depthTextureSize, 1 / depthTextureSize)),
        ],
        ['cameraNear', new Uniform(cameraNear)],
        ['cameraFar', new Uniform(cameraFar)],
      ]),
    });
    this.currentStyle = style;
    this.currentMix = safeMix;
  }

  get style(): ScreenEffectId {
    return this.currentStyle;
  }

  set style(value: ScreenEffectId) {
    if (value === this.currentStyle) return;
    this.currentStyle = value;
    this.uniforms.get('styleMode')!.value = STYLE_MODE[value];
  }

  get mix(): number {
    return this.currentMix;
  }

  set mix(value: number) {
    const safeMix = clampScreenEffectMix(value);
    if (safeMix === this.currentMix) return;
    this.currentMix = safeMix;
    this.uniforms.get('mixAmount')!.value = safeMix;
  }

  set time(value: number) {
    this.uniforms.get('time')!.value = Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  override setSize(width: number, height: number): void {
    (this.uniforms.get('resolution')!.value as Vector2).set(
      Math.max(1, width),
      Math.max(1, height),
    );
  }

  setCameraRange(near: number, far: number): void {
    this.uniforms.get('cameraNear')!.value = near;
    this.uniforms.get('cameraFar')!.value = far;
  }
}
