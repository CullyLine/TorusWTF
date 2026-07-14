'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';

/**
 * Liquid Blob — raymarched metaballs with smooth-minimum fusion.
 *
 * Distinct from Liquid Chrome (which is a vertex-displaced icosahedron and
 * can become spiky at high gain): this preset renders a soft amorphous mass
 * by raymarching a signed distance field made of N spheres blended with
 * `smin`. The whole thing is a single fullscreen quad — there is no surface
 * mesh that can spike, so high-gain audio just inflates and warps the blob
 * instead of producing pointy artifacts.
 */

const RAY_STEPS_HIGH = 96;
const RAY_STEPS_MID = 64;
const RAY_STEPS_LOW = 40;

// Hard cap on orbiting satellites. The for-loop in `sceneInner` runs at
// every raymarch step, so this directly controls worst-case shader cost.
// 10 is enough variety to look "many limbs" without making 1080p high-tier
// renders crawl on integrated GPUs.
const MAX_APPENDAGES = 10;

// Hard cap on sub-spheres. These are gated by a high-transient envelope
// so they spend most of the time at radius ~0 (cheap) and only flare up
// briefly on hi-hats / cymbals / vocal sibilance.
const MAX_SUB_SPHERES = 8;

function buildFragmentShader(steps: number): string {
  return /* glsl */ `
#define RAY_STEPS ${steps}
#define MAX_APPENDAGES ${MAX_APPENDAGES}
#define MAX_SUB_SPHERES ${MAX_SUB_SPHERES}

uniform vec2 uResolution;
uniform float uTime;
// Monotonic JS-accumulated motion phase. Always grows; never decreases
// when audio energy drops. Replaces the older approach of multiplying
// uTime by an energy-dependent factor, which made satellites visibly
// walk backward on energy drops.
uniform float uPhase;
// Separate monotonic phase whose rate is heavily mid/high/beat-driven.
// Drives the satellite orbits so they whip around the blob in time with
// the music without bleeding back into the surface wobble.
uniform float uOrbitPhase;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uEnergy;
uniform float uBeat;
uniform float uScale;
// 0..1 — how much of the bass response is *inflation* (uniform radial
// growth) vs *stretching* (anisotropic elongation along a wobble axis).
// 0 = pure stretch like elastic material being pulled; 1 = pure puff.
uniform float uInflate;
// How many orbiting satellite spheres ("appendages") fuse into the blob.
// 0 = just the anchor sphere alone. Clamped to MAX_APPENDAGES.
uniform int uAppendages;
// Maximum number of sub-spheres that can pop on high-freq transients.
// These are gated by uSubAmount so when transients are quiet they
// shrink to nothing and the cost goes to ~0.
uniform int uSubSphereCount;
// 0..1 envelope driven by detected high-frequency transients. Snaps
// up on hi-hat / cymbal / sibilant hits and decays slowly. Controls
// sub-sphere radius (so they fade smoothly into the main blob).
uniform float uSubAmount;
// 0..1 phase within current 4/4 bar. 0 = downbeat.
uniform float uBarPhase;
// 0..1 pulse on detected bass drops.
uniform float uDrop;
// 0..1 sustained silence — mutes color punch when high.
uniform float uSilence;
uniform vec3 uColorBass;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;

float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Flow Field Update: noise-gradient hash for the curl warp below. Same
// lattice math as the shared flow core (dsp/flowGlsl.ts), inlined lean
// because the raymarcher calls scene() hundreds of times per pixel.
float blobHash(vec3 ip) {
  return fract(sin(dot(ip, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

vec3 blobNoiseGrad(vec3 p) {
  vec3 ip = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec3 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  float a = blobHash(ip);
  float b = blobHash(ip + vec3(1.0, 0.0, 0.0));
  float c = blobHash(ip + vec3(0.0, 1.0, 0.0));
  float d = blobHash(ip + vec3(1.0, 1.0, 0.0));
  float e = blobHash(ip + vec3(0.0, 0.0, 1.0));
  float f1 = blobHash(ip + vec3(1.0, 0.0, 1.0));
  float g = blobHash(ip + vec3(0.0, 1.0, 1.0));
  float h = blobHash(ip + vec3(1.0, 1.0, 1.0));
  float k1 = b - a;
  float k2 = c - a;
  float k3 = e - a;
  float k4 = a - b - c + d;
  float k5 = a - c - e + g;
  float k6 = a - b - e + f1;
  float k7 = -a + b + c - d + e - f1 - g + h;
  return du * vec3(
    k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z,
    k2 + k4 * u.x + k5 * u.z + k7 * u.z * u.x,
    k3 + k5 * u.y + k6 * u.x + k7 * u.x * u.y
  );
}

// Gentle domain warp — jelly-like undulation without breaking the SDF too
// badly. The trig layer gives the base jelly; the curl term (gradient ×
// axis = divergence-free) makes the surface ROIL like real fluid when the
// music pushes.
vec3 warpSpace(vec3 p, float t) {
  float w = 0.09 + uMid * 0.05 + uEnergy * 0.03;
  p.x += sin(p.y * 2.0 + t * 0.85) * w;
  p.y += cos(p.z * 1.7 + t * 0.65) * w;
  p.z += sin(p.x * 2.2 + t * 1.05) * w * 0.65;
  vec3 g = blobNoiseGrad(p * 1.5 + vec3(t * 0.22, t * 0.17, -t * 0.19));
  p += cross(g, vec3(0.577, 0.577, 0.577)) * (0.05 + uEnergy * 0.05 + uBeat * 0.04);
  return p;
}

// Sub-sphere field — large fast-orbiting blobs that pop on high-freq
// transients and merge back into the main blob.
//
// IMPORTANT: returns the SDF of the sub-spheres ALONE (no main blob
// component) so we can reuse it at the hit point to decide how much
// to tint the surface toward the High palette colour. When uSubAmount
// is ~0 the radius collapses and every distance becomes huge — that's
// the desired "disappeared back into the blob" state.
float subField(vec3 p) {
  if (uSubSphereCount <= 0 || uSubAmount < 0.01) return 1e9;
  // Sub-spheres rotate ~1.8x faster than appendages so they read as
  // a distinct fast-twitch layer rather than just smaller appendages.
  float ot = uOrbitPhase * 1.8;
  float d = 1e9;
  for (int i = 0; i < MAX_SUB_SPHERES; i++) {
    if (i >= uSubSphereCount) break;
    float fi = float(i);
    float a = ot * (1.13 + fi * 0.19) + fi * 2.41;
    float b = ot * (0.97 + fi * 0.23) + fi * 1.71;
    float c = ot * (1.31 + fi * 0.17) + fi * 0.97;
    // Wide orbits so the bigger sub-spheres have room to fuse fluidly.
    float orbit = 0.52 + 0.22 * sin(ot * 0.55 + fi * 1.3);
    vec3 center = vec3(
      cos(a) * orbit,
      sin(b) * orbit * 0.85,
      sin(c) * orbit * 0.75
    );
    // Much larger than before — these read as chunky fluid bubbles, not
    // sparkles. A small floor keeps a hint of life even between transients.
    float presence = max(uSubAmount, 0.18);
    float baseR = 0.20 + 0.09 * sin(ot * 2.1 + fi);
    float rr = baseR * presence * (0.9 + uHigh * 0.45);
    d = min(d, sdSphere(p - center, rr));
  }
  return d;
}

// 5-blob field: one anchor + four orbiting satellites that fuse and split.
// Sized small at uScale=1 so the default render is intimate rather than
// screen-filling; the Scale slider multiplies the whole field uniformly.
float sceneInner(vec3 p) {
  // Single monotonic phase from JS, plus the absolute wall clock for the
  // surface wobble (which is fine to tie to uTime because it isn't position-
  // critical and the wobble already moves on its own).
  float t = uPhase;
  float tw = uTime;
  float ot = uOrbitPhase;

  // Anchor sphere — bass contributes here ONLY through the Inflate slider.
  // The beat still gets a small pop so taps register no matter where the
  // user has Inflate set.
  float r0 = 0.42 + uBass * 0.28 * uInflate + uBeat * 0.12;
  float d = sdSphere(p, r0);

  float k = 0.44 + uMid * 0.24 + uHigh * 0.14;

  // Stretch axis: a slowly tumbling unit vector. When Inflate is LOW the
  // bass elongates the satellite cluster along this axis instead of puffing
  // the spheres — it pulls the blob like soft material being tugged.
  vec3 stretchAxis = normalize(vec3(
    sin(t * 0.31 + 0.7),
    cos(t * 0.27 + 1.3),
    sin(t * 0.41 + 2.1)
  ));
  float stretchAmt = uBass * (1.0 - uInflate) * 0.55;

  // Irrational-ish ratios for x/y/z rates so the three axes don't
  // recurrently align into the same standing pattern. GLSL needs a
  // constant loop bound, so we walk the max and break once we've placed
  // the requested number of satellites.
  for (int i = 0; i < MAX_APPENDAGES; i++) {
    if (i >= uAppendages) break;
    float fi = float(i);
    // Orbital angle uses the music-driven phase — satellites whip around the
    // anchor on busy passages and slow down on quiet ones.
    float a = ot * (0.71 + fi * 0.13) + fi * 1.731;
    float b = ot * (0.47 + fi * 0.09) + fi * 2.397;
    float c = ot * (0.59 + fi * 0.07) + fi * 0.973;
    // Per-satellite center bias so orbits don't all pass through origin —
    // breaks the "every satellite stalls at the same point" symmetry.
    vec3 bias = vec3(
      sin(fi * 2.13) * 0.09,
      cos(fi * 1.71) * 0.07,
      sin(fi * 3.31) * 0.08
    );
    // Orbit radius itself swells slightly with bass when inflate is up.
    float orbit = 0.55 + 0.16 * sin(t * 0.61 + fi * 1.9) + uBass * 0.18 * uInflate;
    vec3 center = bias + vec3(
      cos(a) * orbit,
      sin(b) * orbit * 0.8,
      sin(c) * orbit * 0.9
    );
    // Stretch pulls satellites along the axis. Phase-shifted so opposing
    // satellites get pushed in opposite directions, which reads as
    // taffy-pull instead of a uniform drift.
    center += stretchAxis * stretchAmt * cos(a + fi * 1.7) * 1.1;

    float rr = 0.20 + (uMid * 0.12 + uHigh * 0.08) * (0.45 + uInflate * 0.55)
             + 0.05 * sin(t * 1.37 + fi * 2.13);
    d = smin(d, sdSphere(p - center, rr), k);
  }

  // Fold sub-spheres into the field with a tighter k than appendages.
  // The smaller smoothing window makes them read as distinct bumps
  // when they're at full radius, then they melt smoothly back into the
  // surface as uSubAmount decays toward 0.
  //
  // Skip the smin entirely when subField returns its 1e9 "no sub-spheres"
  // sentinel: GPU drivers compile mix(x, y, h) as x + (y - x) * h, and at
  // x = 1e9 the float32 cancellation swallows the real distance and
  // returns 0 — making the SDF zero everywhere, so every ray "hit" at the
  // camera and the blob filled the entire screen whenever the high band
  // was silent.
  float sd = subField(p);
  if (sd < 1e8) d = smin(d, sd, 0.26);

  float wobble = 0.02 * sin(p.x * 4.2 + tw * 0.9) * cos(p.y * 3.8 + tw * 1.05);
  wobble += 0.014 * sin(p.z * 5.1 + tw * 0.75) * cos(p.x * 3.3 + tw * 1.2);
  wobble += 0.01 * sin(dot(p, vec3(1.7, 2.1, 1.9)) * 2.8 + tw * 1.4);
  d += wobble * (1.0 + uMid * 0.35);

  return d;
}

// Standard SDF uniform scaling: shrink/grow space, then rescale the distance.
float scene(vec3 p) {
  float s = max(uScale, 0.05);
  vec3 warped = warpSpace(p / s, uPhase);
  return sceneInner(warped) * s;
}

vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(
    scene(p + e.xyy) - scene(p - e.xyy),
    scene(p + e.yxy) - scene(p - e.yxy),
    scene(p + e.yyx) - scene(p - e.yyx)
  ));
}

vec3 background(vec2 uv) {
  // Soft radial gradient from bass color (deep, low) to mid (lifted) so the
  // blob has something to sit on without a hard rectangle edge.
  float r = length(uv);
  vec3 a = uColorBass * 0.12;
  vec3 b = uColorMid * 0.04;
  return mix(b, a, smoothstep(0.0, 1.1, r));
}

void main() {
  vec2 fragCoord = gl_FragCoord.xy;
  vec2 uv = (fragCoord - 0.5 * uResolution) / uResolution.y;

  // Camera setup: look straight at the origin from z = 3.
  vec3 ro = vec3(0.0, 0.0, 3.0);
  vec3 rd = normalize(vec3(uv, -1.5));

  float t = 0.0;
  float d = 1e9;
  bool hit = false;
  for (int i = 0; i < RAY_STEPS; i++) {
    vec3 p = ro + t * rd;
    d = scene(p);
    if (d < 0.0015) { hit = true; break; }
    t += d * 0.92;
    if (t > 8.0) break;
  }

  vec3 col;
  if (hit) {
    vec3 p = ro + t * rd;
    vec3 n = calcNormal(p);
    vec3 V = -rd;

    // Key light + soft fill — palette-tinted.
    vec3 keyDir = normalize(vec3(0.35, 0.55, 0.75));
    vec3 fillDir = normalize(vec3(-0.6, -0.3, 0.4));
    float keyDiff = max(0.0, dot(n, keyDir));
    float fillDiff = max(0.0, dot(n, fillDir)) * 0.5;

    // Iridescent fresnel — the rim takes the high color, the body lerps
    // between bass (deep) and mid (face).
    float fres = pow(1.0 - max(0.0, dot(n, V)), 2.5);
    vec3 body = mix(uColorBass, uColorMid, smoothstep(-1.0, 1.0, n.y) + n.x * 0.15);
    vec3 rim = uColorHigh;
    vec3 base = mix(body, rim, fres);

    // Spec highlight along key reflection.
    vec3 R = reflect(rd, n);
    float spec = pow(max(0.0, dot(R, keyDir)), 24.0) * 0.7;

    col = base * (0.22 + keyDiff * 0.65 + fillDiff * 0.35);
    col += vec3(spec) * mix(uColorMid, uColorHigh, 0.5);
    col += rim * fres * 0.45;

    // Sub-sphere tint: if the hit point sits on (or near) a sub-sphere
    // surface we push the colour hard toward the High palette colour so
    // the sub-spheres read as the same "voice" as the high transients
    // that spawned them. subWeight is 1 when the ray hit landed ON a
    // sub-sphere surface, 0 when we're well into the main body.
    //
    // We sample subField in normalized "inner" space — the same space
    // subField was defined in — because sceneInner is called with
    // pre-scaled coordinates everywhere else in this shader.
    float s = max(uScale, 0.05);
    vec3 pInner = p / s;
    // Reversed-edge smoothstep is undefined per the GLSL spec, so build
    // the falloff from the well-defined ascending form instead.
    float subAtHit = subField(pInner) * s;
    float subWeight = 1.0 - smoothstep(-0.02, 0.10, subAtHit);
    col = mix(col, uColorHigh * (1.4 + uHigh * 0.6), subWeight * 0.55);

    // Beat injection + downbeat flash + drop punch.
    float barFlash = uBarPhase > 0.0 ? pow(1.0 - uBarPhase, 6.0) : 0.0;
    float silenceMute = 1.0 - uSilence * 0.7;
    col += uColorHigh * (uBeat * 0.35 + uEnergy * 0.12 + barFlash * 0.4 + uDrop * 0.9) * silenceMute;

    // Soft AO via distance to the next hit (cheap fake).
    float ao = clamp(0.6 + 0.4 * dot(n, V), 0.0, 1.0);
    col *= ao;
  } else {
    col = background(uv);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;
}

const vertexShader = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export function LiquidBlobScene({
  analyser,
  palette,
  tier,
  scale = 1,
  speed = 1,
  inflate = 0.5,
  appendages = 4,
  subSpheres = 6,
}: VisualizerSceneProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();
  const { size } = useThree();
  const phaseRef = useRef(0);
  const orbitPhaseRef = useRef(0);

  const steps = tier === 'high' ? RAY_STEPS_HIGH : tier === 'mid' ? RAY_STEPS_MID : RAY_STEPS_LOW;
  const fragmentShader = useMemo(() => buildFragmentShader(steps), [steps]);

  const uniforms = useMemo(
    () => ({
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uPhase: { value: 0 },
      uOrbitPhase: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
      uEnergy: { value: 0 },
      uBeat: { value: 0 },
      uScale: { value: 1 },
      uInflate: { value: 0.5 },
      uAppendages: { value: 4 },
      uSubSphereCount: { value: 6 },
      uSubAmount: { value: 0 },
      uBarPhase: { value: 0 },
      uDrop: { value: 0 },
      uSilence: { value: 0 },
      uColorBass: { value: new THREE.Color(palette.bass) },
      uColorMid: { value: new THREE.Color(palette.mid) },
      uColorHigh: { value: new THREE.Color(palette.high) },
    }),
    [palette.bass, palette.mid, palette.high],
  );

  useFrame((state, delta) => {
    const mat = matRef.current;
    if (!mat) return;
    const m = metricsRef.current;
    const pace = Math.max(0.05, speed);
    // Forward-only motion phase. Rate modulates with energy but the phase
    // itself never decreases, which prevents satellites from oscillating
    // when energy fluctuates rapidly.
    const phaseRate = (0.35 + Math.min(m.energy, 1.5) * 0.18) * pace;
    phaseRef.current += Math.min(delta, 0.05) * phaseRate;

    // Orbit phase: heavily mid/high-driven (impact envelope for the kick)
    // so the satellites visibly whip around the blob on busy passages.
    // Floored so it never stalls.
    const orbitSpeed =
      (0.6 + Math.min(m.mid, 2) * 1.6 + Math.min(m.high, 2) * 0.9 + m.impact * 0.8) * pace;
    orbitPhaseRef.current += Math.min(delta, 0.05) * orbitSpeed;

    mat.uniforms.uResolution!.value.set(size.width, size.height);
    mat.uniforms.uTime!.value = state.clock.elapsedTime;
    mat.uniforms.uPhase!.value = phaseRef.current;
    mat.uniforms.uOrbitPhase!.value = orbitPhaseRef.current;
    mat.uniforms.uBass!.value = m.bass;
    mat.uniforms.uMid!.value = m.mid;
    mat.uniforms.uHigh!.value = m.high;
    mat.uniforms.uEnergy!.value = m.energy;
    // Impact envelope, not the raw beat spike: the pop swells in and melts
    // out over ~¼s so hits read as a fluid pulse of mass.
    mat.uniforms.uBeat!.value = m.impact;
    mat.uniforms.uScale!.value = scale;
    mat.uniforms.uInflate!.value = Math.max(0, Math.min(1, inflate));
    // Round + clamp to the shader's hard cap. 0 = anchor sphere alone.
    mat.uniforms.uAppendages!.value = Math.max(
      0,
      Math.min(MAX_APPENDAGES, Math.round(appendages)),
    );

    mat.uniforms.uSubSphereCount!.value = Math.max(
      0,
      Math.min(MAX_SUB_SPHERES, Math.round(subSpheres)),
    );
    // Shared shimmer envelope (hi-hat / cymbal transients with a slow melt)
    // drives the sub-sphere presence — same signal the rest of the engine
    // sparkles to, so the whole scene agrees on what the hats are doing.
    mat.uniforms.uSubAmount!.value = m.shimmer;
    mat.uniforms.uBarPhase!.value = m.barPhase;
    mat.uniforms.uDrop!.value = m.dropEvent;
    mat.uniforms.uSilence!.value = m.silence;
    (mat.uniforms.uColorBass!.value as THREE.Color).set(palette.bass);
    (mat.uniforms.uColorMid!.value as THREE.Color).set(palette.mid);
    (mat.uniforms.uColorHigh!.value as THREE.Color).set(palette.high);
    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  // Fullscreen triangle (clip-space, no matrices). Disable depth so the
  // post-process Bloom in SceneRig still picks up bright pixels.
  return (
    <mesh frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3]}
          count={3}
          itemSize={3}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}
