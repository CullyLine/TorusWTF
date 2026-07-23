/**
 * Shared GLSL declarations and helpers for every screen-style module.
 * Uniform names here are the compile-time half of the typed frame contract.
 */

export const SCREEN_SHADER_DECLARATIONS = /* glsl */ `
uniform float mixAmount;
uniform float time;
uniform vec2 resolution;
uniform vec3 colorBass;
uniform vec3 colorMid;
uniform vec3 colorHigh;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float energy;
uniform float impact;
uniform float swell;
uniform float shimmer;
uniform float kick;
uniform float snare;
uniform float hat;
uniform float sectionLevel;
uniform float afterglow;
uniform float silence;
uniform float tension;
uniform float dropEvent;
uniform float release;
uniform float tenderness;
uniform float gather;
uniform float convergence;
uniform sampler2D sceneDepth;
uniform vec2 depthTexel;
uniform float cameraNear;
uniform float cameraFar;
uniform float tier;
`;

export const SCREEN_SHADER_HELPERS = /* glsl */ `
float screenLuma(const in vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

float colorEdge(const in vec4 center, const in vec2 uv) {
  vec2 texel = 1.0 / max(resolution, vec2(1.0));
  vec2 safeUv = clamp(uv, texel, vec2(1.0) - texel);
  float left = screenLuma(texture2D(inputBuffer, safeUv - vec2(texel.x, 0.0)).rgb);
  float right = screenLuma(texture2D(inputBuffer, safeUv + vec2(texel.x, 0.0)).rgb);
  float down = screenLuma(texture2D(inputBuffer, safeUv - vec2(0.0, texel.y)).rgb);
  float up = screenLuma(texture2D(inputBuffer, safeUv + vec2(0.0, texel.y)).rgb);
  float centerLuma = screenLuma(center.rgb);
  float laplacian = abs(left + right + down + up - 4.0 * centerLuma);
  float gradient = abs(left - right) + abs(down - up);
  return smoothstep(0.07, 0.38, gradient + laplacian * 0.45);
}

float viewDistance(const in vec2 uv) {
  vec2 safeUv = clamp(uv, depthTexel, vec2(1.0) - depthTexel);
  float depth = texture2D(sceneDepth, safeUv).r;
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
`;
