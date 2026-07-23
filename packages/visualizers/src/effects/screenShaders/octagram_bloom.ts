/** Mirrored eightfold flower geometry with sparkling petal edges. */
export const OCTAGRAM_BLOOM_SHADER_SOURCE = /* glsl */ `
#if defined(TIER_LOW)
#define OCTAGRAM_SPARKLE 2
#elif defined(TIER_MID)
#define OCTAGRAM_SPARKLE 4
#else
#define OCTAGRAM_SPARKLE 6
#endif

float octagram_bloomHash(const in vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.19);
}

vec2 octagram_bloomMirror(const in vec2 p) {
  float angle = atan(p.y, p.x);
  float radius = length(p);
  float sector = 6.2831853 / 8.0;
  float spin = snare * 1.75 + time * 0.15;
  float folded = abs(mod(angle + spin, sector) - sector * 0.5);
  return vec2(cos(folded), sin(folded)) * radius;
}

vec3 octagram_bloomStyle(const in vec4 inputColor, const in vec2 uv) {
  vec2 centered = uv * 2.0 - 1.0;
  float aspect = resolution.x / max(resolution.y, 1.0);
  centered.x *= aspect;

  float open = 1.0 + swell * 0.55;
  vec2 petalUv = octagram_bloomMirror(centered / max(open, 0.001));
  float petalRadius = length(petalUv);
  float petalEdge = abs(sin(petalRadius * 9.0 - swell * 2.5));
  float bloom = 1.0 - smoothstep(0.18, 1.15, petalRadius);

  vec2 sampleUv = clamp(vec2(petalUv.x / max(aspect, 0.001), petalUv.y) * 0.5 + 0.5, vec2(0.0), vec2(1.0));
  vec3 sampled = texture2D(inputBuffer, sampleUv).rgb;

  vec3 petalTint = mix(colorMid, colorHigh, clamp(petalRadius, 0.0, 1.0));
  vec3 styled = mix(inputColor.rgb, sampled * mix(vec3(1.0), petalTint, 0.35), bloom);

  float sparkAccum = 0.0;
  for (int i = 0; i < OCTAGRAM_SPARKLE; i++) {
    float fi = float(i);
    vec2 sparkCell = floor(sampleUv * (18.0 + fi * 3.0) + vec2(fi * 1.7, time * (1.2 + hat)));
    float spark = step(0.92 - hat * 0.12, octagram_bloomHash(sparkCell + fi));
    sparkAccum += spark * (0.08 + hat * 0.14);
  }

  float edgeSpark = (1.0 - smoothstep(0.02, 0.15, petalEdge)) * (0.25 + hat * 0.85);
  styled += mix(colorHigh, colorBass, 0.35) * (sparkAccum + edgeSpark) * bloom;
  styled += colorMid * bloom * swell * 0.12;
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

  vec3 styled = octagram_bloomStyle(inputColor, uv);
  outputColor = vec4(mix(inputColor.rgb, styled, wet), inputColor.a);
}
`;
