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

function buildFragmentShader(steps: number): string {
  return /* glsl */ `
#define RAY_STEPS ${steps}
#define MAX_APPENDAGES ${MAX_APPENDAGES}

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

  float k = 0.32 + uMid * 0.18 + uHigh * 0.1;

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

  d += 0.012 * sin(p.x * 5.0 + tw) * cos(p.y * 4.4 + tw * 1.1) * sin(p.z * 4.7 + tw * 0.8);

  return d;
}

// Standard SDF uniform scaling: shrink/grow space, then rescale the distance.
float scene(vec3 p) {
  float s = max(uScale, 0.05);
  return sceneInner(p / s) * s;
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
  inflate = 0.5,
  appendages = 4,
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
    // Forward-only motion phase. Speed modulates with energy but the phase
    // itself never decreases, which prevents satellites from oscillating
    // when energy fluctuates rapidly.
    const speed = 0.35 + Math.min(m.energy, 1.5) * 0.18;
    phaseRef.current += Math.min(delta, 0.05) * speed;

    // Orbit phase: heavily mid/high/beat-driven so the satellites visibly
    // whip around the blob on busy passages. Floored so it never stalls.
    const orbitSpeed =
      0.6 +
      Math.min(m.mid, 2) * 1.6 +
      Math.min(m.high, 2) * 0.9 +
      m.beat * 0.7;
    orbitPhaseRef.current += Math.min(delta, 0.05) * orbitSpeed;

    mat.uniforms.uResolution!.value.set(size.width, size.height);
    mat.uniforms.uTime!.value = state.clock.elapsedTime;
    mat.uniforms.uPhase!.value = phaseRef.current;
    mat.uniforms.uOrbitPhase!.value = orbitPhaseRef.current;
    mat.uniforms.uBass!.value = m.bass;
    mat.uniforms.uMid!.value = m.mid;
    mat.uniforms.uHigh!.value = m.high;
    mat.uniforms.uEnergy!.value = m.energy;
    mat.uniforms.uBeat!.value = m.beat;
    mat.uniforms.uScale!.value = scale;
    mat.uniforms.uInflate!.value = Math.max(0, Math.min(1, inflate));
    // Round + clamp to the shader's hard cap. 0 = anchor sphere alone.
    mat.uniforms.uAppendages!.value = Math.max(
      0,
      Math.min(MAX_APPENDAGES, Math.round(appendages)),
    );
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
