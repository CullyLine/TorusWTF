/** Posterized color with scene outlines. */
export const CARTOON_SHADER_SOURCE = /* glsl */ `
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
  if (wet <= 0.001) {
    outputColor = inputColor;
    return;
  }

  vec3 styled = cartoonStyle(inputColor, uv);
  outputColor = vec4(mix(inputColor.rgb, styled, wet), inputColor.a);
}
`;
