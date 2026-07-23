/** Block pixels, reduced colors, and ordered dithering. */
export const PIXEL8_SHADER_SOURCE = /* glsl */ `
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

  vec3 styled = pixel8Style(uv);
  outputColor = vec4(mix(inputColor.rgb, styled, wet), inputColor.a);
}
`;
