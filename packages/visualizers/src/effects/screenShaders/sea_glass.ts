/** Refractive water-sheet distortion with caustic crests. */
export const SEA_GLASS_SHADER_SOURCE = /* glsl */ `
#if defined(TIER_LOW)
#define SEA_GLASS_WAVES 2
#elif defined(TIER_MID)
#define SEA_GLASS_WAVES 3
#else
#define SEA_GLASS_WAVES 5
#endif

float sea_glassWave(const in vec2 p, const in float t, const in vec2 dir, const in float freq) {
  return sin(dot(p, dir) * freq + t);
}

vec3 sea_glassStyle(const in vec4 inputColor, const in vec2 uv) {
  float settle = clamp(1.0 - silence, 0.0, 1.0);
  float amp = (0.012 + swell * 0.045) * settle;
  vec2 travel = uv;

  vec2 grad = vec2(0.0);
  for (int i = 0; i < SEA_GLASS_WAVES; i++) {
    float fi = float(i);
    float t = time * (0.7 + fi * 0.21) + kick * (1.4 + fi * 0.3);
    vec2 dir = normalize(vec2(sin(fi * 1.7 + 0.4), cos(fi * 2.3 + 0.9)) + vec2(0.0001));
    float freq = 8.0 + fi * 3.5 + swell * 4.0;
    float wave = sea_glassWave(uv, t, dir, freq);
    grad += dir * wave * (amp / (fi + 1.0));
  }

  vec2 fromCenter = uv - vec2(0.5);
  float ripple = exp(-length(fromCenter) * max(1.0, 6.0 - kick * 3.0)) * kick * 0.035 * settle;
  vec2 rippleDir = fromCenter / max(length(fromCenter), 0.001);
  vec2 warped = clamp(travel + grad + rippleDir * ripple, vec2(0.0), vec2(1.0));

  vec3 refracted = texture2D(inputBuffer, warped).rgb;
  float crest = clamp(length(grad) / max(amp, 0.0001), 0.0, 1.0);
  float caustic = pow(max(crest, 0.0), 2.2);

  vec3 tint = mix(colorMid, colorHigh, clamp(caustic, 0.0, 1.0));
  vec3 styled = mix(inputColor.rgb, refracted, 0.7 * settle + 0.15);
  styled = mix(styled, styled * mix(vec3(1.0), tint, 0.4), 0.55);
  styled += tint * caustic * (0.2 + shimmer * 0.55) * settle;
  styled = mix(inputColor.rgb, styled, settle * 0.92 + 0.08);
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

  vec3 styled = sea_glassStyle(inputColor, uv);
  outputColor = vec4(mix(inputColor.rgb, styled, wet), inputColor.a);
}
`;
