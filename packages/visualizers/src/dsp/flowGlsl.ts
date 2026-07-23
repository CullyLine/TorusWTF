/**
 * GLSL twin of `flowfield.ts` — the same curl-noise flow math as a shader
 * chunk, shared by the Flow Field GPGPU sim and shader presets that want
 * true divergence-free warping (including Galaxy Garden's arm flow).
 *
 * Keep the constants in sync with flowfield.ts: same hash, same domain
 * offsets, same vortex/well profiles — so CPU-advected presets and GPU
 * particles ride the SAME currents.
 *
 * All identifiers are prefixed `ff` to avoid collisions when concatenated
 * into preset shaders.
 */

export const FLOW_GLSL = /* glsl */ `
float ffHash(vec3 ip, float seed) {
  float d = dot(ip, vec3(127.1, 311.7, 74.7)) + seed * 19.19;
  return fract(sin(d) * 43758.5453123);
}

// Value noise + analytic gradient. Returns vec4(gradient, value).
vec4 ffNoised(vec3 p, float seed) {
  vec3 ip = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec3 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);

  float a = ffHash(ip + vec3(0.0, 0.0, 0.0), seed);
  float b = ffHash(ip + vec3(1.0, 0.0, 0.0), seed);
  float c = ffHash(ip + vec3(0.0, 1.0, 0.0), seed);
  float d = ffHash(ip + vec3(1.0, 1.0, 0.0), seed);
  float e = ffHash(ip + vec3(0.0, 0.0, 1.0), seed);
  float f1 = ffHash(ip + vec3(1.0, 0.0, 1.0), seed);
  float g = ffHash(ip + vec3(0.0, 1.0, 1.0), seed);
  float h = ffHash(ip + vec3(1.0, 1.0, 1.0), seed);

  float k0 = a;
  float k1 = b - a;
  float k2 = c - a;
  float k3 = e - a;
  float k4 = a - b - c + d;
  float k5 = a - c - e + g;
  float k6 = a - b - e + f1;
  float k7 = -a + b + c - d + e - f1 - g + h;

  float v = k0 + k1 * u.x + k2 * u.y + k3 * u.z
          + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x
          + k7 * u.x * u.y * u.z;
  vec3 grad = du * vec3(
    k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z,
    k2 + k4 * u.x + k5 * u.z + k7 * u.z * u.x,
    k3 + k5 * u.y + k6 * u.x + k7 * u.x * u.y
  );
  return vec4(grad, v);
}

// Divergence-free curl of a 3-component noise potential.
vec3 ffCurl(vec3 p, float seed) {
  vec3 g1 = ffNoised(p, seed).xyz;
  vec3 g2 = ffNoised(p + vec3(31.341), seed).xyz;
  vec3 g3 = ffNoised(p + vec3(-47.853), seed).xyz;
  return vec3(g3.y - g2.z, g1.z - g3.x, g2.x - g1.y);
}

// Vortex around the Y axis: tangential swirl + inward pull + core lift.
vec3 ffVortex(vec3 p, float strength) {
  float r2 = p.x * p.x + p.z * p.z;
  float r = sqrt(r2) + 1e-5;
  float profile = r / (0.5 + r2);
  vec2 tang = vec2(-p.z, p.x) / r;
  vec2 radial = vec2(p.x, p.z) / r;
  vec2 xz = tang * profile - radial * (0.35 * profile);
  return strength * vec3(xz.x, 0.45 * profile, xz.y);
}

// Attractor (strength > 0) / repulsor (strength < 0) well, smooth falloff.
vec3 ffWell(vec3 p, vec3 center, float strength, float radius) {
  vec3 d = center - p;
  float d2 = dot(d, d);
  float falloff = radius * radius / (radius * radius + d2);
  return d * (strength * falloff / (sqrt(d2) + 0.12));
}

// Full composed flow: 2-octave curl + per-band domain offset.
// band: 0 bass, 1 mid, 2 high. bandSpread 0 = all bands share one current.
vec3 ffFlow(
  vec3 p, float band, float time, float fieldScale, float turbulence,
  float swirl, float bandSpread, float seed
) {
  float bandOff = band * 13.7 * bandSpread;
  float t = time * 0.18;
  vec3 sp = vec3(
    (p.x + bandOff) * fieldScale + t,
    (p.y - bandOff * 0.6) * fieldScale + t * 0.83,
    (p.z + bandOff * 0.3) * fieldScale - t * 0.71
  );
  vec3 v = ffCurl(sp, seed);
  v += ffCurl(sp * 2.3 + vec3(7.7, -3.1, 5.9), seed) * (0.5 * turbulence);
  return v * swirl;
}
`;
