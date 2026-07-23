/** Green scan-grid wireframe remap (existing matrix look). */
export const MATRIX_SHADER_SOURCE = /* glsl */ `
vec3 matrixStyle(const in vec4 inputColor, const in vec2 uv) {
  float luma = screenLuma(max(inputColor.rgb, vec3(0.0)));
  float edge = max(colorEdge(inputColor, uv), depthEdge(uv));
  vec2 pixel = uv * max(resolution, vec2(1.0));
  float scan = 0.84 + 0.16 * sin(pixel.y * 1.55 + time * 8.0);
  float gridX = smoothstep(0.92, 1.0, abs(sin(pixel.x * 0.19)));
  float gridY = smoothstep(0.94, 1.0, abs(sin(pixel.y * 0.19 - time * 0.9)));
  float column = 0.5 + 0.5 * sin(floor(pixel.x / 12.0) * 17.13 + time * 2.4);
  float rain = pow(max(0.0, sin(uv.y * 42.0 - time * (2.0 + column * 3.0))), 10.0);
  float signal = clamp(
    luma * 0.62 + edge * 1.15 + (gridX + gridY) * 0.055 + rain * 0.12,
    0.0,
    1.0
  );
  return vec3(0.004, signal * scan, 0.035 + signal * 0.31);
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

  vec3 styled = matrixStyle(inputColor, uv);
  outputColor = vec4(mix(inputColor.rgb, styled, wet), inputColor.a);
}
`;
