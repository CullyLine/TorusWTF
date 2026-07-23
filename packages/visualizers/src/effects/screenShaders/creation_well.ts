/** Radial energy well with impact rings and palette channel phases. */
export const CREATION_WELL_SHADER_SOURCE = /* glsl */ `
#if defined(TIER_LOW)
#define CREATION_RINGS 3
#elif defined(TIER_MID)
#define CREATION_RINGS 5
#else
#define CREATION_RINGS 8
#endif

vec3 creation_wellStyle(const in vec4 inputColor, const in vec2 uv) {
  vec2 centered = uv * 2.0 - 1.0;
  float aspect = resolution.x / max(resolution.y, 1.0);
  centered.x *= aspect;

  float radius = length(centered);
  float angle = atan(centered.y, centered.x);
  float bend = audioBass * 0.55;
  float tunnel = radius + bend * sin(angle * 3.0 + time * 1.3) * radius;

  float phase = time * (0.35 + energy * 0.4);
  vec3 channel = vec3(
    0.5 + 0.5 * sin(phase + tunnel * 4.0),
    0.5 + 0.5 * sin(phase + 2.094 + tunnel * 4.0),
    0.5 + 0.5 * sin(phase + 4.188 + tunnel * 4.0)
  );
  vec3 paletteMix = colorBass * channel.x + colorMid * channel.y + colorHigh * channel.z;
  float paletteNorm = max(channel.x + channel.y + channel.z, 0.001);
  paletteMix /= paletteNorm;

  float ringPulse = 0.0;
  for (int i = 0; i < CREATION_RINGS; i++) {
    float fi = float(i);
    float ringCenter = fract(impact * 0.85 + fi * 0.11 - time * 0.22);
    float ringDist = abs(tunnel - ringCenter);
    float width = 0.035 + impact * 0.04;
    ringPulse += exp(-pow(ringDist / max(width, 0.001), 2.0)) * (1.0 - fi / float(CREATION_RINGS));
  }

  float wellDepth = 1.0 - smoothstep(0.05, 1.2, tunnel);
  vec2 radialDir = centered / max(radius, 0.001);
  vec2 warpUv = clamp(uv - radialDir * (wellDepth * 0.08 + bend * 0.03), vec2(0.0), vec2(1.0));
  vec3 sampled = texture2D(inputBuffer, warpUv).rgb;

  vec3 styled = mix(inputColor.rgb, sampled, 0.55 + wellDepth * 0.3);
  styled = mix(styled, styled * paletteMix * 1.35, 0.55);
  styled += paletteMix * ringPulse * (0.35 + impact * 0.55);
  styled += colorHigh * wellDepth * 0.12;
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

  vec3 styled = creation_wellStyle(inputColor, uv);
  outputColor = vec4(mix(inputColor.rgb, styled, wet), inputColor.a);
}
`;
