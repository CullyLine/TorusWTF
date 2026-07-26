'use client';

/**
 * Ink Bloom — dark still water from above. Musical anatomy:
 *  - kick → curling ink plume blooms, billows, and drifts
 *  - snare → lateral shear across the plumes (backbeat crack)
 *  - hat → sparse surface mote sparkles
 *  - gather → ink draws toward center (pre-beat inhale)
 *  - tenderness → ink pales toward milk on gentle vocals
 *  - swell / afterglow → soft residual bloom in the water body
 * Hold-breath listen:
 *  - holdBreath / deep silence → suspend plumes mid-curl + glass the
 *    surface so the ink listens, then thaw into billow and drift.
 *  - kick bloom, snare shear, hat motes, gather pull, tenderness milk stay.
 */

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';

const PLUMES_HIGH = 8;
const PLUMES_MID = 6;
const PLUMES_LOW = 4;

const OCTAVES_HIGH = 5;
const OCTAVES_MID = 4;
const OCTAVES_LOW = 3;

type Plume = {
  x: number;
  y: number;
  strength: number;
  seed: number;
  age: number;
  spin: number;
};

function buildFragmentShader(plumeCount: number, octaves: number): string {
  return /* glsl */ `
#define PLUME_COUNT ${plumeCount}
#define NOISE_OCTAVES ${octaves}

uniform vec2 uResolution;
uniform float uTime;
uniform float uGather;
uniform float uSnare;
uniform float uHat;
uniform float uTenderness;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uSwell;
uniform float uAfterglow;
uniform float uEnergy;
uniform float uBarPhase;
uniform float uBgAlpha;
uniform float uStillness;
uniform vec4 uPlumes[PLUME_COUNT];
uniform float uPlumeAge[PLUME_COUNT];
uniform float uPlumeSpin[PLUME_COUNT];
uniform vec3 uColorBass;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < NOISE_OCTAVES; i++) {
    v += a * vnoise(p);
    p = p * 2.07 + vec2(1.7, 9.2);
    a *= 0.52;
  }
  return v;
}

// Curl-ish offset from value-noise gradients — soft billow without finite diffs.
vec2 curlOffset(vec2 p, float t) {
  float n1 = fbm(p + vec2(t * 0.11, 0.0));
  float n2 = fbm(p + vec2(4.2, t * 0.09));
  return vec2(n2 - 0.5, 0.5 - n1) * 2.0;
}

float plumeDensity(vec2 uv, vec4 plume, float age, float spin) {
  float str = clamp(plume.z, 0.0, 1.4);
  if (str < 0.004) return 0.0;

  float seed = plume.w;
  vec2 center = plume.xy;
  vec2 d = uv - center;

  // Spiral curl: rotate sample space as the plume ages so ink coils.
  float ang = atan(d.y, d.x) + spin + age * (0.55 + seed * 0.45);
  float r = length(d);
  float bloom = 0.08 + age * (0.22 + seed * 0.12) + str * 0.06;
  vec2 polar = vec2(cos(ang), sin(ang)) * r;

  // Domain warp — ink filaments billow instead of sitting as soft blobs.
  vec2 warped = polar + curlOffset(polar * (2.4 + seed) + seed * 6.0, uTime + age) * (0.12 + age * 0.18);
  float filaments = fbm(warped * (3.2 - age * 0.55) + vec2(seed * 3.1, age * 0.4));
  filaments = smoothstep(0.28, 0.82, filaments);

  // Soft radial envelope that expands then thins with age.
  float envelope = exp(-r * r / max(bloom * bloom, 1e-4));
  float ring = exp(-pow((r - bloom * 0.55) / max(bloom * 0.55, 1e-4), 2.0));
  float body = mix(envelope, ring * 0.85 + envelope * 0.55, clamp(age * 0.55, 0.0, 1.0));

  // Age fade: strong early bloom, long soft trail.
  float life = exp(-age * 0.55) * (0.55 + str * 0.7);
  return body * filaments * life * (0.75 + seed * 0.35);
}

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);

  float snare = clamp(uSnare, 0.0, 1.2);
  float gather = clamp(uGather, 0.0, 1.0);
  float tender = clamp(uTenderness, 0.0, 1.0);
  float still = clamp(uStillness, 0.0, 1.0);

  // Gather inhale: water draws toward the still center.
  float r0 = length(uv) + 1e-4;
  uv *= 1.0 - gather * (0.42 + 0.38 * smoothstep(0.08, 1.15, r0));
  // Snare: lateral shear across the surface (plume crack).
  uv.x += snare * 0.055 * sign(uv.x + 1e-4);

  float r = length(uv);

  // Still dark water body — barely alive idle shimmer.
  // holdBreath glasses the surface: hush grain drift, polish toward mirror.
  vec2 waterUv = uv * 1.35;
  waterUv += curlOffset(waterUv * 1.1, uTime * 0.08) * (0.04 + uSwell * 0.05) * (1.0 - still * 0.88);
  float waterGrain = fbm(waterUv * 1.6 + uTime * 0.04 * (1.0 - still * 0.9));
  float sheen = smoothstep(0.35, 0.75, waterGrain) * (0.04 + uSwell * 0.06 + uMid * 0.03);
  sheen *= exp(-r * r * 0.55);
  // Cool glass highlight — listens as a quiet mirror, not dead black.
  float glassRim = pow(clamp(1.0 - r * 0.85, 0.0, 1.0), 2.2) * (0.05 + 0.07 * (1.0 - waterGrain));
  sheen = mix(sheen, sheen * 0.32 + glassRim, still);

  float ink = 0.0;
  float edge = 0.0;
  for (int i = 0; i < PLUME_COUNT; i++) {
    float d = plumeDensity(uv, uPlumes[i], uPlumeAge[i], uPlumeSpin[i]);
    ink += d;
    // Soft luminous rim where ink meets water.
    edge += smoothstep(0.02, 0.18, d) * (1.0 - smoothstep(0.18, 0.55, d));
  }
  ink = clamp(ink, 0.0, 2.6);
  edge = clamp(edge, 0.0, 1.8);

  // Sparse hat motes on the water surface (not sustained shimmer).
  float moteField = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 cell = floor(uv * (9.0 + fi * 3.0) + vec2(fi * 1.7, uTime * 0.15));
    float h = hash21(cell + fi * 17.0);
    float tickSelect = step(0.62, fract(h * 5.17 + fi * 0.31));
    vec2 local = fract(uv * (9.0 + fi * 3.0) + vec2(fi * 1.7, uTime * 0.15)) - 0.5;
    float spark = exp(-dot(local, local) * 90.0) * tickSelect * smoothstep(0.55, 0.95, h);
    moteField += spark;
  }
  moteField = clamp(moteField, 0.0, 1.4);

  // Palette: deep indigo water → ink body → pale milk on tenderness.
  vec3 deepWater = mix(uColorBass, vec3(0.04, 0.05, 0.09), 0.72) * 0.22;
  vec3 inkBody = mix(uColorBass, vec3(0.12, 0.1, 0.18), 0.35);
  vec3 inkMid = mix(uColorMid, vec3(0.35, 0.32, 0.48), 0.4);
  vec3 inkHigh = mix(uColorHigh, vec3(0.78, 0.82, 0.92), 0.35);
  vec3 milk = mix(inkHigh, vec3(0.92, 0.93, 0.96), 0.7);

  vec3 waterCol = deepWater + sheen * mix(uColorMid, inkHigh, 0.4) * 0.55;
  waterCol += inkHigh * uAfterglow * 0.05 * exp(-r * r * 0.8);
  // holdBreath: cool glass skim over deep water (distinct from tenderness milk).
  vec3 glassWater = mix(deepWater, mix(inkHigh, vec3(0.72, 0.8, 0.9), 0.45), 0.28);
  waterCol = mix(waterCol, glassWater + sheen * inkHigh * 0.35, still * 0.55);

  float tCol = clamp(ink * 0.45 + r * 0.2, 0.0, 1.0);
  vec3 plumeCol = mix(inkBody, inkMid, smoothstep(0.0, 0.55, tCol));
  plumeCol = mix(plumeCol, inkHigh, smoothstep(0.35, 1.1, tCol) * 0.45);
  // Tenderness pales ink toward milk without wiping motion.
  plumeCol = mix(plumeCol, milk, tender * 0.72);
  waterCol = mix(waterCol, mix(deepWater, milk, 0.55), tender * 0.28);

  vec3 col = waterCol;
  col = mix(col, plumeCol, clamp(ink * (0.55 + uEnergy * 0.12), 0.0, 0.92));
  col += mix(inkMid, milk, tender * 0.5) * edge * (0.22 + uAfterglow * 0.12);
  // Snare flank flash on the sheared sides.
  float flank = smoothstep(0.22, 0.85, abs(uv.x)) * (1.0 - smoothstep(0.55, 1.25, abs(uv.y)));
  col += mix(uColorMid, milk, 0.35) * flank * snare * 0.42;
  // Hat mote glitter — cool high-band ticks on the surface.
  col += mix(uColorHigh, milk, 0.4) * moteField * uHat * 1.15;
  col += inkHigh * uAfterglow * (0.04 + ink * 0.06);

  float barFlash = pow(1.0 - uBarPhase, 9.0) * (0.03 + ink * 0.04);
  col += milk * barFlash;

  float vig = 1.0 - smoothstep(0.85, 1.55, r);
  col *= 0.58 + 0.42 * vig;

  float alpha = mix(0.72 + ink * 0.18 + sheen * 0.1 + uAfterglow * 0.08, 1.0, uBgAlpha);
  alpha = clamp(alpha, 0.0, 1.0);
  if (uBgAlpha < 0.5) {
    float miss = smoothstep(1.35, 0.22, r);
    alpha *= 0.28 + miss * 0.72;
    col *= 0.88 + ink * 0.22;
  }

  gl_FragColor = vec4(col, alpha);
}
`;
}

const vertexShader = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

function smoothToward(
  current: number,
  target: number,
  dt: number,
  riseTau: number,
  fallTau: number,
) {
  const tau = target > current ? riseTau : fallTau;
  const k = 1 - Math.exp(-dt / Math.max(tau, 1e-4));
  return current + (target - current) * k;
}

function makePlumes(count: number): Plume[] {
  return Array.from({ length: count }, (_, i) => ({
    x: 0,
    y: 0,
    strength: 0,
    seed: (i + 1) * 0.137,
    age: 0,
    spin: 0,
  }));
}

export function InkBloomScene({
  analyser,
  palette,
  tier,
  speed = 1,
  backdrop = false,
}: VisualizerSceneProps) {
  const mods = useModulation();
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();
  const { size } = useThree();
  const timeRef = useRef(0);
  const gatherSmooth = useRef(0);
  const snareSmooth = useRef(0);
  const hatSmooth = useRef(0);
  const tenderSmooth = useRef(0);
  const swellSmooth = useRef(0.12);
  const afterglowSmooth = useRef(0);
  const kickSmooth = useRef(0);
  const stillnessSmooth = useRef(0);
  const prevKickRef = useRef(0);
  const spawnSeedRef = useRef(0.37);

  const plumeCount = tier === 'high' ? PLUMES_HIGH : tier === 'mid' ? PLUMES_MID : PLUMES_LOW;
  const octaveCount =
    tier === 'high' ? OCTAVES_HIGH : tier === 'mid' ? OCTAVES_MID : OCTAVES_LOW;
  const kitAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const plumesRef = useRef<Plume[]>(makePlumes(plumeCount));

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const fragmentShader = useMemo(
    () => buildFragmentShader(plumeCount, octaveCount),
    [plumeCount, octaveCount],
  );

  const uniforms = useMemo(() => {
    const plumeVecs = Array.from({ length: plumeCount }, () => new THREE.Vector4(0, 0, 0, 0));
    const plumeAges = new Array(plumeCount).fill(0) as number[];
    const plumeSpins = new Array(plumeCount).fill(0) as number[];
    return {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uGather: { value: 0 },
      uSnare: { value: 0 },
      uHat: { value: 0 },
      uTenderness: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
      uSwell: { value: 0.12 },
      uAfterglow: { value: 0 },
      uEnergy: { value: 0 },
      uBarPhase: { value: 0 },
      uBgAlpha: { value: 1 },
      uStillness: { value: 0 },
      uPlumes: { value: plumeVecs },
      uPlumeAge: { value: plumeAges },
      uPlumeSpin: { value: plumeSpins },
      uColorBass: { value: new THREE.Color(palette.bass) },
      uColorMid: { value: new THREE.Color(palette.mid) },
      uColorHigh: { value: new THREE.Color(palette.high) },
    };
    // Colors rewritten every frame from the living palette.
  }, [plumeCount]);

  useFrame((_state, delta) => {
    const mat = matRef.current;
    if (!mat) return;
    const m = metricsRef.current;
    const dt = Math.min(delta, 0.1);
    const pace = Math.max(0.05, mods.current.speed ?? speed);
    const calm = reducedMotion ? 0.35 : 1;
    const sectionPace = 0.75 + m.sectionLevel * 0.45;

    // Hold-breath stillness: ink suspends mid-curl and the surface glasses.
    // Rise a touch slower than the thaw so freeze reads as settling, not a cut.
    const stillnessTarget = Math.min(
      1,
      Math.max(m.holdBreath, m.silence * 0.92) + Math.min(m.holdBreath, m.silence) * 0.15,
    );
    stillnessSmooth.current = smoothToward(
      stillnessSmooth.current,
      stillnessTarget,
      dt,
      0.14,
      0.08,
    );
    const stillness = stillnessSmooth.current;
    // Nearly freeze billow clock + plume drift; a whisper remains so thaw never pops.
    const motionMul = 1 - stillness * 0.9;

    timeRef.current +=
      dt *
      pace *
      sectionPace *
      calm *
      motionMul *
      (0.45 + m.swell * 0.55 + m.impact * 0.15);

    if (plumesRef.current.length !== plumeCount) {
      plumesRef.current = makePlumes(plumeCount);
    }

    gatherSmooth.current = smoothToward(gatherSmooth.current, m.gather, dt, 0.04, 0.14);
    swellSmooth.current = smoothToward(swellSmooth.current, m.swell, dt, 0.12, 0.45);
    snareSmooth.current = smoothToward(
      snareSmooth.current,
      Math.min(1.2, m.snare) * kitAmp,
      dt,
      0.02,
      0.12,
    );
    hatSmooth.current = smoothToward(
      hatSmooth.current,
      Math.min(1.2, m.hat * 0.95 + m.shimmer * 0.2) * kitAmp,
      dt,
      0.015,
      0.08,
    );
    tenderSmooth.current = smoothToward(tenderSmooth.current, m.tenderness, dt, 0.12, 0.22);
    afterglowSmooth.current = smoothToward(afterglowSmooth.current, m.afterglow, dt, 0.18, 0.8);
    kickSmooth.current = smoothToward(
      kickSmooth.current,
      Math.min(1.2, m.kick) * kitAmp,
      dt,
      0.025,
      0.14,
    );

    // One-shot plume spawn on kick rise — each kick blooms a distinct curl.
    // Kit stays ungated so a kick through quiet still lands a new plume.
    const kick = kickSmooth.current;
    const prevKick = prevKickRef.current;
    if (kick > 0.22 && prevKick < 0.14) {
      const plumes = plumesRef.current;
      let slot = 0;
      let weakest = Infinity;
      for (let i = 0; i < plumes.length; i++) {
        const p = plumes[i]!;
        if (p.strength < weakest) {
          weakest = p.strength;
          slot = i;
        }
      }
      spawnSeedRef.current = (spawnSeedRef.current * 1.6180339887 + 0.37) % 1;
      const seed = spawnSeedRef.current;
      const ang = seed * Math.PI * 2;
      const rad = 0.12 + ((seed * 7.13) % 1) * 0.42;
      const gatherPull = 1 - gatherSmooth.current * 0.55;
      plumes[slot] = {
        x: Math.cos(ang) * rad * gatherPull,
        y: Math.sin(ang) * rad * gatherPull,
        strength: Math.min(1.35, 0.7 + kick * 0.65),
        seed,
        age: 0,
        spin: (seed - 0.5) * 2.4,
      };
    }
    prevKickRef.current = kick;

    // Drift / billow / gather-pull each plume in CPU so the shader stays cheap.
    // holdBreath gates age/drift/spin/fade so curls suspend mid-coil; gather still reels.
    const plumes = plumesRef.current;
    const gather = gatherSmooth.current;
    for (let i = 0; i < plumes.length; i++) {
      const p = plumes[i]!;
      if (p.strength < 0.002) {
        p.strength = 0;
        continue;
      }
      p.age += dt * pace * calm * motionMul;
      // Soft outward drift + swirl; gather gently reels toward center.
      const swirl = 0.18 + p.seed * 0.12;
      const ox = -p.y * swirl * dt * motionMul;
      const oy = p.x * swirl * dt * motionMul;
      p.x += ox + (p.seed - 0.5) * 0.04 * dt * motionMul;
      p.y += oy + (0.5 - p.seed) * 0.03 * dt * motionMul;
      p.x *= 1 - gather * 0.55 * dt * 4;
      p.y *= 1 - gather * 0.55 * dt * 4;
      p.spin += dt * (0.35 + p.seed * 0.45) * pace * motionMul;
      // Strength fade nearly freezes while listening so plumes don't evaporate mid-hold.
      p.strength *= Math.exp((-dt * motionMul) / (1.35 + p.seed * 0.4));
    }

    const plumeVecs = mat.uniforms.uPlumes!.value as THREE.Vector4[];
    const plumeAges = mat.uniforms.uPlumeAge!.value as number[];
    const plumeSpins = mat.uniforms.uPlumeSpin!.value as number[];
    for (let i = 0; i < plumeCount; i++) {
      const p = plumes[i]!;
      plumeVecs[i]!.set(p.x, p.y, p.strength, p.seed);
      plumeAges[i] = p.age;
      plumeSpins[i] = p.spin;
    }

    mat.uniforms.uResolution!.value.set(size.width, size.height);
    mat.uniforms.uTime!.value = timeRef.current;
    mat.uniforms.uGather!.value = gatherSmooth.current;
    mat.uniforms.uSnare!.value = snareSmooth.current;
    mat.uniforms.uHat!.value = hatSmooth.current;
    mat.uniforms.uTenderness!.value = tenderSmooth.current;
    mat.uniforms.uStillness!.value = stillness;
    mat.uniforms.uBass!.value = m.bass;
    mat.uniforms.uMid!.value = m.mid;
    mat.uniforms.uHigh!.value = m.high;
    mat.uniforms.uSwell!.value = swellSmooth.current;
    mat.uniforms.uAfterglow!.value = afterglowSmooth.current;
    mat.uniforms.uEnergy!.value = m.energy + afterglowSmooth.current * 0.25;
    mat.uniforms.uBarPhase!.value = m.barPhase;
    mat.uniforms.uBgAlpha!.value = backdrop ? 0 : 1;
    (mat.uniforms.uColorBass!.value as THREE.Color).set(palette.bass);
    (mat.uniforms.uColorMid!.value as THREE.Color).set(palette.mid);
    (mat.uniforms.uColorHigh!.value as THREE.Color).set(palette.high);

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  return (
    <mesh frustumCulled={false} renderOrder={1}>
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
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}
