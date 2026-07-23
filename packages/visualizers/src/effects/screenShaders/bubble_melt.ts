/** Glossy fused bubble-cell reconstruction with iridescent rims. */
export const BUBBLE_MELT_SHADER_SOURCE = /* glsl */ `
#if defined(TIER_LOW)
#define BUBBLE_MELT_RADIUS 1
#elif defined(TIER_MID)
#define BUBBLE_MELT_RADIUS 2
#else
#define BUBBLE_MELT_RADIUS 3
#endif

float bubble_meltHash(const in vec2 p) {
  return fract(sin(dot(p, vec2(41.17, 289.53))) * 7919.131);
}

vec2 bubble_meltHash2(const in vec2 p) {
  return fract(sin(vec2(dot(p, vec2(27.9, 71.3)), dot(p, vec2(53.1, 19.7)))) * 4375.854);
}

vec3 bubble_meltStyle(const in vec4 inputColor, const in vec2 uv) {
  float inflate = 1.0 + audioBass * 0.55;
  float fuse = clamp(impact * 0.85 + energy * 0.2, 0.0, 1.0);
  float cellScale = mix(14.0, 8.5, fuse) / max(inflate, 0.001);
  vec2 gridUv = uv * cellScale;
  vec2 cell = floor(gridUv);
  vec2 local = fract(gridUv);

  float bestDist = 8.0;
  float secondDist = 8.0;
  vec2 bestJitter = vec2(0.0);
  vec2 bestCell = cell;

  for (int y = -BUBBLE_MELT_RADIUS; y <= BUBBLE_MELT_RADIUS; y++) {
    for (int x = -BUBBLE_MELT_RADIUS; x <= BUBBLE_MELT_RADIUS; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 candidate = cell + neighbor;
      vec2 jitter = bubble_meltHash2(candidate) * mix(0.92, 0.55, fuse);
      vec2 point = neighbor + jitter;
      float dist = length(local - point);
      if (dist < bestDist) {
        secondDist = bestDist;
        bestDist = dist;
        bestJitter = jitter;
        bestCell = candidate;
      } else if (dist < secondDist) {
        secondDist = dist;
      }
    }
  }

  float edgeGap = max(secondDist - bestDist, 0.0);
  float cellInterior = smoothstep(0.02, 0.18 + fuse * 0.12, edgeGap);
  float softRim = 1.0 - cellInterior;

  vec2 sampleUv = clamp((bestCell + bestJitter) / max(cellScale, 0.001), vec2(0.0), vec2(1.0));
  vec3 cellColor = texture2D(inputBuffer, sampleUv).rgb;
  vec3 baseColor = mix(inputColor.rgb, cellColor, 0.72);

  float depthKeep = 1.0 - depthEdge(uv) * 0.75;
  float nearSubject = 1.0 - smoothstep(4.0, 18.0, viewDistance(uv));
  float silhouette = clamp(depthKeep * (0.55 + nearSubject * 0.45), 0.0, 1.0);

  float gloss = pow(max(1.0 - bestDist, 0.0), mix(2.4, 1.3, fuse));
  float hueSpin = bubble_meltHash(bestCell) + time * (0.35 + shimmer * 1.4);
  vec3 iris = 0.5 + 0.5 * cos(vec3(hueSpin, hueSpin + 2.094, hueSpin + 4.188));
  vec3 rimColor = mix(colorHigh, iris, 0.65) * (0.35 + shimmer * 0.9);

  vec3 styled = mix(inputColor.rgb, baseColor, cellInterior * silhouette);
  styled += rimColor * softRim * (0.45 + gloss * 0.8);
  styled += colorMid * gloss * 0.18 * silhouette;
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

  vec3 styled = bubble_meltStyle(inputColor, uv);
  outputColor = vec4(mix(inputColor.rgb, styled, wet), inputColor.a);
}
`;
