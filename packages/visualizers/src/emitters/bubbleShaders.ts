export const BUBBLE_VERTEX_SHADER = /* glsl */ `
attribute float aAge;
attribute float aLifetime;
attribute float aSeed;
attribute float aSize;

uniform float uPointScale;
uniform float uPixelRatio;

varying float vAlpha;
varying float vSeed;

void main() {
  float alive = step(0.0, aAge) * (1.0 - step(aLifetime, aAge));
  float life = clamp(aAge / max(0.001, aLifetime), 0.0, 1.0);
  float fadeIn = smoothstep(0.0, 0.07, life);
  float fadeOut = 1.0 - smoothstep(0.72, 1.0, life);
  float fade = alive * fadeIn * fadeOut;

  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  float perspective = clamp(2.2 / max(0.45, -viewPosition.z), 0.38, 3.2);
  float diameter = aSize * uPointScale * uPixelRatio * 32.0 * perspective;

  gl_Position = projectionMatrix * viewPosition;
  gl_PointSize = clamp(diameter * fade, 0.0, 180.0);
  vAlpha = fade;
  vSeed = aSeed;
}
`;

export const BUBBLE_FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uAudioGlow;
uniform vec3 uColorBass;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;

varying float vAlpha;
varying float vSeed;

const float TAU = 6.28318530718;

vec3 paletteRamp(float phase) {
  float p = fract(phase) * 3.0;
  if (p < 1.0) return mix(uColorBass, uColorMid, p);
  if (p < 2.0) return mix(uColorMid, uColorHigh, p - 1.0);
  return mix(uColorHigh, uColorBass, p - 2.0);
}

void main() {
  vec2 point = gl_PointCoord * 2.0 - 1.0;
  float radius = length(point);
  if (radius > 1.0 || vAlpha <= 0.0) discard;

  // Reconstruct a sphere normal from the point sprite. Its grazing angle is
  // the Fresnel term that gives a soap bubble its bright, translucent rim.
  float sphereZ = sqrt(max(0.0, 1.0 - radius * radius));
  vec3 normal = normalize(vec3(point, sphereZ));
  float fresnel = pow(1.0 - sphereZ, 2.15);
  float softEdge = 1.0 - smoothstep(0.93, 1.0, radius);
  float rim = smoothstep(0.5, 0.94, radius) * softEdge;

  // Palette-linked thin-film interference. Each particle keeps a stable seed;
  // time only drifts the film slowly, so exports remain deterministic.
  float filmPhase = vSeed + fresnel * 1.75 + uTime * 0.018;
  vec3 paletteColor = paletteRamp(filmPhase);
  vec3 spectrum = 0.52 + 0.48 * cos(TAU * (filmPhase + vec3(0.0, 0.333, 0.667)));
  vec3 filmColor = mix(paletteColor, paletteColor * 0.55 + spectrum * 0.6, 0.48);

  vec3 lightDirection = normalize(vec3(-0.35, 0.48, 1.0));
  float highlight = pow(max(0.0, dot(normal, lightDirection)), 28.0);
  float body = 0.035 + (1.0 - radius) * 0.045;
  float alpha =
    (body + fresnel * 0.5 + rim * 0.3 + highlight * 0.22) *
    softEdge *
    uOpacity *
    vAlpha;
  vec3 color =
    filmColor * (0.28 + fresnel * 1.05 + rim * 0.45) * uAudioGlow +
    vec3(highlight * 0.7);

  gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
}
`;
