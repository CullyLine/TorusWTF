/** Recursive triangular chambers and warm luminous facets. */
export const PYRAMID_CATHEDRAL_SHADER_SOURCE = /* glsl */ `
#if defined(TIER_LOW)
#define PYRAMID_DEPTH 3
#elif defined(TIER_MID)
#define PYRAMID_DEPTH 5
#else
#define PYRAMID_DEPTH 7
#endif

vec2 pyramid_cathedralFold(const in vec2 p) {
  vec2 q = abs(p);
  if (q.x + q.y > 1.0) {
    q = vec2(1.0) - q.yx;
  }
  return q;
}

vec3 pyramid_cathedralStyle(const in vec4 inputColor, const in vec2 uv) {
  vec2 centered = uv * 2.0 - 1.0;
  float aspect = resolution.x / max(resolution.y, 1.0);
  centered.x *= aspect;

  float perspective = 1.0 + audioBass * 0.85;
  float pulse = kick * 0.22;
  vec2 ray = centered / max(perspective, 0.001);
  ray *= 1.0 - pulse;

  float facetId = 0.0;
  float chamber = 0.0;
  vec2 walk = ray;
  for (int i = 0; i < PYRAMID_DEPTH; i++) {
    float level = float(i);
    walk = pyramid_cathedralFold(walk * (1.35 + level * 0.08));
    float tri = abs(walk.x + walk.y * 0.577);
    chamber += exp(-tri * (3.2 + audioBass * 2.0)) * (1.0 / (level + 1.0));
    facetId += tri * (0.37 + level * 0.11);
    walk *= 1.55;
  }

  float warp = chamber * 0.08 + pulse * 0.04;
  vec2 radialDir = centered / max(length(centered), 0.001);
  vec2 sampleUv = clamp(uv + radialDir * warp, vec2(0.0), vec2(1.0));
  vec3 sampled = texture2D(inputBuffer, sampleUv).rgb;

  float facetShade = 0.55 + 0.45 * sin(facetId * 6.2831 + time * 0.4);
  vec3 warm = mix(colorBass, colorMid, clamp(afterglow, 0.0, 1.0));
  vec3 cool = mix(colorMid, colorHigh, 0.5);
  vec3 facetColor = mix(cool, warm, clamp(chamber * 0.65 + afterglow * 0.45, 0.0, 1.0));

  vec3 styled = mix(inputColor.rgb, sampled * mix(vec3(1.0), facetColor, 0.55), 0.75);
  styled *= mix(0.78, 1.15, facetShade);
  styled += warm * chamber * (0.18 + afterglow * 0.35);
  styled += colorHigh * pulse * 0.25;
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

  vec3 styled = pyramid_cathedralStyle(inputColor, uv);
  outputColor = vec4(mix(inputColor.rgb, styled, wet), inputColor.a);
}
`;
