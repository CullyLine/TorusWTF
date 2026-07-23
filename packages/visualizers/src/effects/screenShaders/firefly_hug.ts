/** Edge-guided motes that gather around subjects, then release. */
export const FIREFLY_HUG_SHADER_SOURCE = /* glsl */ `
#if defined(TIER_LOW)
#define FIREFLY_COUNT 3
#elif defined(TIER_MID)
#define FIREFLY_COUNT 5
#else
#define FIREFLY_COUNT 8
#endif

vec2 firefly_hugHash2(const in float n) {
  return fract(sin(vec2(n, n * 1.37)) * vec2(43758.5453, 22578.1459));
}

vec3 firefly_hugStyle(const in vec4 inputColor, const in vec2 uv) {
  float edge = max(colorEdge(inputColor, uv), depthEdge(uv));
  float pull = clamp(tenderness * 0.65 + gather * 0.55 + convergence * 0.25, 0.0, 1.0);
  float disperse = clamp(release * 0.7 + dropEvent * 0.9, 0.0, 1.0);
  float inward = pull * (1.0 - disperse);

  vec2 center = vec2(0.5);
  vec3 moteLight = vec3(0.0);
  for (int i = 0; i < FIREFLY_COUNT; i++) {
    float fi = float(i);
    vec2 seed = firefly_hugHash2(fi + 1.0);
    float orbit = time * (0.15 + seed.x * 0.35) + fi;
    vec2 base = seed;
    base += vec2(sin(orbit), cos(orbit * 1.3)) * (0.08 + seed.y * 0.1);
    base = mix(base, center, inward * 0.55);
    vec2 fromCenter = base - center;
    base += fromCenter / max(length(fromCenter), 0.001) * disperse * 0.22;
    base = clamp(base, vec2(0.0), vec2(1.0));

    vec4 moteCenter = texture2D(inputBuffer, base);
    float moteEdge = max(colorEdge(moteCenter, base), depthEdge(base));
    float attract = mix(0.35, 1.0, moteEdge);

    float dist = length(uv - base);
    float radius = 0.018 + (1.0 - edge) * 0.01 + disperse * 0.02;
    float glow = exp(-pow(dist / max(radius, 0.001), 2.0)) * attract;
    float twinkle = 0.55 + 0.45 * sin(time * (3.0 + fi) + seed.x * 6.28);
    vec3 moteColor = mix(colorMid, colorHigh, seed.y);
    moteColor = mix(moteColor, colorBass, 0.2 * (1.0 - seed.x));
    moteLight += moteColor * glow * twinkle * (0.45 + pull * 0.55);
  }

  vec3 styled = inputColor.rgb;
  styled += moteLight * (0.55 + edge * 0.65);
  styled = mix(styled, styled * mix(vec3(1.0), colorMid, 0.2), pull * 0.35);
  styled += colorHigh * edge * inward * 0.12;
  return min(styled, vec3(2.5));
}

void mainImage(
  const in vec4 inputColor,
  const in vec2 uv,
  out vec4 outputColor
) {
  float wet = clamp(mixAmount, 0.0, 1.0);
  if (wet <= 0.001) {
    outputColor = inputColor;
    return;
  }

  vec3 styled = firefly_hugStyle(inputColor, uv);
  outputColor = vec4(mix(inputColor.rgb, styled, wet), inputColor.a);
}
`;
