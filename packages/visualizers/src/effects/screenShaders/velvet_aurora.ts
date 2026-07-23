/** Soft flow-warped ribbons with chromatic smears. */
export const VELVET_AURORA_SHADER_SOURCE = /* glsl */ `
#if defined(TIER_LOW)
#define VELVET_FLOW 2
#elif defined(TIER_MID)
#define VELVET_FLOW 3
#else
#define VELVET_FLOW 5
#endif

vec2 velvet_auroraFlow(const in vec2 p, const in float t) {
  vec2 flow = vec2(0.0);
  vec2 q = p;
  for (int i = 0; i < VELVET_FLOW; i++) {
    float fi = float(i);
    float a = t * (0.2 + fi * 0.07) + fi * 1.7;
    flow += vec2(sin(q.y * (2.4 + fi) + a), cos(q.x * (2.1 + fi) - a));
    q = q * 1.35 + flow * 0.15;
  }
  return flow / float(VELVET_FLOW);
}

vec3 velvet_auroraStyle(const in vec4 inputColor, const in vec2 uv) {
  float steer = clamp(audioMid * 0.7 + tenderness * 0.55, 0.0, 1.0);
  float flick = snare * 0.045;
  vec2 flow = velvet_auroraFlow(uv * (1.5 + steer), time * (0.35 + steer * 0.4));
  vec2 lateral = vec2(flick * (0.6 + flow.x * 0.4), 0.0);

  float smear = 0.01 + steer * 0.02 + afterglow * 0.01;
  vec2 uvR = clamp(uv + flow * smear + lateral, vec2(0.0), vec2(1.0));
  vec2 uvG = clamp(uv + flow * smear * 0.7, vec2(0.0), vec2(1.0));
  vec2 uvB = clamp(uv - flow * smear * 0.55 - lateral * 0.5, vec2(0.0), vec2(1.0));

  float r = texture2D(inputBuffer, uvR).r;
  float g = texture2D(inputBuffer, uvG).g;
  float b = texture2D(inputBuffer, uvB).b;
  vec3 smeared = vec3(r, g, b);

  float ribbon = 0.5 + 0.5 * sin(uv.y * 10.0 + flow.x * 3.0 + time * 0.8 + steer * 2.0);
  ribbon *= 0.5 + 0.5 * sin(uv.x * 7.0 - flow.y * 2.5 + tenderness);
  float ribbonMask = smoothstep(0.35, 0.85, ribbon);

  vec3 aurora = mix(colorBass, colorMid, clamp(steer, 0.0, 1.0));
  aurora = mix(aurora, colorHigh, clamp(afterglow * 0.65 + ribbonMask * 0.35, 0.0, 1.0));

  vec3 styled = mix(inputColor.rgb, smeared, 0.62 + steer * 0.2);
  styled = mix(styled, styled * mix(vec3(1.0), aurora, 0.55), ribbonMask * (0.45 + afterglow * 0.4));
  styled += aurora * ribbonMask * (0.12 + afterglow * 0.28);
  styled += colorHigh * snare * 0.18;
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

  vec3 styled = velvet_auroraStyle(inputColor, uv);
  outputColor = vec4(mix(inputColor.rgb, styled, wet), inputColor.a);
}
`;
