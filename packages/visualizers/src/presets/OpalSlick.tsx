'use client';

/**
 * Opal Slick — dark rain puddle close-up. Musical anatomy:
 *  - kick → ripple rings that bend and refract the thin-film sheen
 *  - snare → lateral shear across the oil film
 *  - hat → sparse micro-glints on the surface
 *  - gather → swirl pulls toward center (pre-beat inhale)
 *  - tenderness → film milkens toward pearl
 *  - swell / afterglow → soft residual spectral wash
 */

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';

const RIPPLES_HIGH = 7;
const RIPPLES_MID = 5;
const RIPPLES_LOW = 3;

const OCTAVES_HIGH = 5;
const OCTAVES_MID = 4;
const OCTAVES_LOW = 3;

type Ripple = {
  x: number;
  y: number;
  strength: number;
  seed: number;
  age: number;
};

function buildFragmentShader(rippleCount: number, octaves: number): string {
  return /* glsl */ `
#define RIPPLE_COUNT ${rippleCount}
#define NOISE_OCTAVES ${octaves}

uniform vec2 uResolution;
uniform float uTime;
uniform float uGather;
uniform float uKick;
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
uniform vec4 uRipples[RIPPLE_COUNT];
uniform float uRippleAge[RIPPLE_COUNT];
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

vec2 curlOffset(vec2 p, float t) {
  float n1 = fbm(p + vec2(t * 0.09, 0.0));
  float n2 = fbm(p + vec2(3.8, t * 0.07));
  return vec2(n2 - 0.5, 0.5 - n1) * 2.0;
}

// Approximate thin-film interference for R/G/B optical path.
vec3 thinFilm(float path) {
  vec3 wl = vec3(0.62, 0.54, 0.46);
  return 0.5 + 0.5 * cos(6.28318 * path / wl + vec3(0.0, 2.094, 4.188));
}

// Expanding kick ripple: radial bend + thickness crest.
vec2 rippleBend(vec2 uv, out float crest) {
  vec2 bend = vec2(0.0);
  crest = 0.0;
  for (int i = 0; i < RIPPLE_COUNT; i++) {
    vec4 rip = uRipples[i];
    float str = clamp(rip.z, 0.0, 1.4);
    if (str < 0.004) continue;
    float age = uRippleAge[i];
    float seed = rip.w;
    vec2 d = uv - rip.xy;
    float r = length(d) + 1e-4;
    float radius = age * (0.42 + seed * 0.18) + 0.02;
    float width = 0.045 + age * 0.03;
    float ring = exp(-pow((r - radius) / max(width, 1e-4), 2.0));
    float life = exp(-age * 0.85) * str;
    float amp = ring * life;
    bend += (d / r) * amp * (0.055 + seed * 0.02);
    crest += amp;
  }
  crest = clamp(crest, 0.0, 1.8);
  return bend;
}

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);

  float snare = clamp(uSnare, 0.0, 1.2);
  float gather = clamp(uGather, 0.0, 1.0);
  float tender = clamp(uTenderness, 0.0, 1.0);
  float kick = clamp(uKick, 0.0, 1.2);

  // Gather inhale: film swirls tighten toward the still center.
  float r0 = length(uv) + 1e-4;
  uv *= 1.0 - gather * (0.38 + 0.42 * smoothstep(0.08, 1.2, r0));
  float ang0 = atan(uv.y, uv.x);
  ang0 += sin(ang0 * 2.0 + uTime * 0.35) * gather * 0.18;
  uv = vec2(cos(ang0), sin(ang0)) * length(uv);
  // Snare: lateral shear crack across the slick.
  uv.x += snare * 0.06 * sign(uv.x + 1e-4);

  float crest = 0.0;
  uv += rippleBend(uv, crest);

  float r = length(uv);

  // Slow oil-film swirl — living thickness field.
  float swirlT = uTime * (0.12 + uSwell * 0.18 + uEnergy * 0.06);
  vec2 flow = uv * (1.25 + uSwell * 0.2);
  flow += curlOffset(flow * 1.15 + gather * 0.4, swirlT) * (0.18 + uSwell * 0.22);
  flow.x += snare * 0.04;
  // Soft angular drift so idle still breathes.
  float ang = atan(flow.y, flow.x) + swirlT * 0.15 + gather * 0.35;
  float fr = length(flow);
  flow = vec2(cos(ang), sin(ang)) * fr;

  float film = fbm(flow * 1.55 + vec2(swirlT * 0.2, 0.0));
  film = mix(film, fbm(flow * 2.4 - swirlT * 0.15), 0.45);
  // Kick crest locally thickens the film (refraction bend reads as rainbow warp).
  film += crest * (0.35 + kick * 0.2);
  film += uBass * 0.06 + uMid * 0.04;

  // Optical path from film + grazing falloff toward rim.
  float path = 0.35 + film * 1.85 + r * 0.22 + uAfterglow * 0.12;
  vec3 iridescence = thinFilm(path);
  // Mix living palette into the spectral sheen so it stays branded.
  iridescence = mix(iridescence, mix(uColorMid, uColorHigh, film), 0.28);
  iridescence = mix(iridescence, uColorBass, 0.12 * (1.0 - film));

  // Dark wet asphalt under the oil.
  vec3 puddle = mix(uColorBass, vec3(0.03, 0.035, 0.05), 0.78) * 0.28;
  puddle += curlOffset(uv * 2.2, swirlT * 0.5).x * 0.015;
  float wetSheen = smoothstep(0.4, 0.85, fbm(uv * 2.8 + swirlT * 0.05)) * (0.04 + uSwell * 0.05);
  puddle += wetSheen * mix(uColorMid, uColorHigh, 0.4);

  // Pearl milk on tenderness — softens spectral bite toward opal white.
  vec3 pearl = mix(vec3(0.88, 0.9, 0.94), mix(uColorHigh, vec3(1.0), 0.35), 0.35);
  iridescence = mix(iridescence, pearl, tender * 0.62);
  puddle = mix(puddle, mix(puddle, pearl, 0.55), tender * 0.32);

  // Film coverage: stronger toward center, lifted by swell/energy/crest.
  float cover = smoothstep(1.35, 0.15, r);
  cover *= 0.42 + uSwell * 0.35 + uEnergy * 0.2 + crest * 0.35 + film * 0.25;
  cover = clamp(cover, 0.0, 1.0);

  vec3 col = puddle;
  col = mix(col, iridescence * (0.55 + film * 0.55), cover * (0.72 + uAfterglow * 0.15));
  // Kick crest flash — rainbow ridge brightens without strobing.
  col += iridescence * crest * (0.28 + kick * 0.22);
  // Snare flank flash on sheared sides.
  float flank = smoothstep(0.2, 0.85, abs(uv.x)) * (1.0 - smoothstep(0.5, 1.2, abs(uv.y)));
  col += mix(uColorMid, pearl, 0.4) * flank * snare * 0.38;

  // Sparse hat micro-glints (tick-selected, not sustained shimmer).
  float moteField = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 cell = floor(uv * (11.0 + fi * 4.0) + vec2(fi * 2.1, uTime * 0.2));
    float h = hash21(cell + fi * 19.0);
    float tickSelect = step(0.68, fract(h * 5.17 + fi * 0.31));
    vec2 local = fract(uv * (11.0 + fi * 4.0) + vec2(fi * 2.1, uTime * 0.2)) - 0.5;
    float spark = exp(-dot(local, local) * 110.0) * tickSelect * smoothstep(0.55, 0.95, h);
    moteField += spark;
  }
  moteField = clamp(moteField, 0.0, 1.4);
  col += mix(uColorHigh, pearl, 0.45) * moteField * uHat * 1.2;

  col += pearl * uAfterglow * (0.05 + cover * 0.08);
  float barFlash = pow(1.0 - uBarPhase, 9.0) * (0.03 + crest * 0.05);
  col += pearl * barFlash;

  float vig = 1.0 - smoothstep(0.85, 1.55, r);
  col *= 0.55 + 0.45 * vig;

  float alpha = mix(0.74 + cover * 0.18 + crest * 0.08 + uAfterglow * 0.08, 1.0, uBgAlpha);
  alpha = clamp(alpha, 0.0, 1.0);
  if (uBgAlpha < 0.5) {
    float miss = smoothstep(1.35, 0.22, r);
    alpha *= 0.28 + miss * 0.72;
    col *= 0.88 + cover * 0.22;
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

function makeRipples(count: number): Ripple[] {
  return Array.from({ length: count }, (_, i) => ({
    x: 0,
    y: 0,
    strength: 0,
    seed: (i + 1) * 0.137,
    age: 0,
  }));
}

export function OpalSlickScene({
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
  const kickSmooth = useRef(0);
  const snareSmooth = useRef(0);
  const hatSmooth = useRef(0);
  const tenderSmooth = useRef(0);
  const swellSmooth = useRef(0.12);
  const afterglowSmooth = useRef(0);
  const prevKickRef = useRef(0);
  const spawnSeedRef = useRef(0.41);

  const rippleCount =
    tier === 'high' ? RIPPLES_HIGH : tier === 'mid' ? RIPPLES_MID : RIPPLES_LOW;
  const octaveCount =
    tier === 'high' ? OCTAVES_HIGH : tier === 'mid' ? OCTAVES_MID : OCTAVES_LOW;
  const kitAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const ripplesRef = useRef<Ripple[]>(makeRipples(rippleCount));

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const fragmentShader = useMemo(
    () => buildFragmentShader(rippleCount, octaveCount),
    [rippleCount, octaveCount],
  );

  const uniforms = useMemo(() => {
    const rippleVecs = Array.from({ length: rippleCount }, () => new THREE.Vector4(0, 0, 0, 0));
    const rippleAges = new Array(rippleCount).fill(0) as number[];
    return {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uGather: { value: 0 },
      uKick: { value: 0 },
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
      uRipples: { value: rippleVecs },
      uRippleAge: { value: rippleAges },
      uColorBass: { value: new THREE.Color(palette.bass) },
      uColorMid: { value: new THREE.Color(palette.mid) },
      uColorHigh: { value: new THREE.Color(palette.high) },
    };
    // Colors rewritten every frame from the living palette.
  }, [rippleCount]);

  useFrame((_state, delta) => {
    const mat = matRef.current;
    if (!mat) return;
    const m = metricsRef.current;
    const dt = Math.min(delta, 0.1);
    const pace = Math.max(0.05, mods.current.speed ?? speed);
    const calm = reducedMotion ? 0.35 : 1;
    const sectionPace = 0.75 + m.sectionLevel * 0.45;

    timeRef.current +=
      dt * pace * sectionPace * calm * (0.45 + m.swell * 0.55 + m.impact * 0.15);

    if (ripplesRef.current.length !== rippleCount) {
      ripplesRef.current = makeRipples(rippleCount);
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

    // One-shot ripple spawn on kick rise — each kick drops a distinct ring.
    const kick = kickSmooth.current;
    const prevKick = prevKickRef.current;
    if (kick > 0.22 && prevKick < 0.14) {
      const ripples = ripplesRef.current;
      let slot = 0;
      let weakest = Infinity;
      for (let i = 0; i < ripples.length; i++) {
        const rip = ripples[i]!;
        if (rip.strength < weakest) {
          weakest = rip.strength;
          slot = i;
        }
      }
      spawnSeedRef.current = (spawnSeedRef.current * 1.6180339887 + 0.37) % 1;
      const seed = spawnSeedRef.current;
      const ang = seed * Math.PI * 2;
      const rad = 0.05 + (seed * 7.13 % 1) * 0.28;
      const gatherPull = 1 - gatherSmooth.current * 0.55;
      ripples[slot] = {
        x: Math.cos(ang) * rad * gatherPull,
        y: Math.sin(ang) * rad * gatherPull,
        strength: Math.min(1.35, 0.72 + kick * 0.65),
        seed,
        age: 0,
      };
    }
    prevKickRef.current = kick;

    const ripples = ripplesRef.current;
    const gather = gatherSmooth.current;
    for (let i = 0; i < ripples.length; i++) {
      const rip = ripples[i]!;
      if (rip.strength < 0.002) {
        rip.strength = 0;
        continue;
      }
      rip.age += dt * pace * calm;
      // Mild center drift under gather so rings tighten with the inhale.
      rip.x *= 1 - gather * 0.4 * dt * 3.5;
      rip.y *= 1 - gather * 0.4 * dt * 3.5;
      rip.strength *= Math.exp(-dt / (1.15 + rip.seed * 0.35));
    }

    const rippleVecs = mat.uniforms.uRipples!.value as THREE.Vector4[];
    const rippleAges = mat.uniforms.uRippleAge!.value as number[];
    for (let i = 0; i < rippleCount; i++) {
      const rip = ripples[i]!;
      rippleVecs[i]!.set(rip.x, rip.y, rip.strength, rip.seed);
      rippleAges[i] = rip.age;
    }

    mat.uniforms.uResolution!.value.set(size.width, size.height);
    mat.uniforms.uTime!.value = timeRef.current;
    mat.uniforms.uGather!.value = gatherSmooth.current;
    mat.uniforms.uKick!.value = kickSmooth.current;
    mat.uniforms.uSnare!.value = snareSmooth.current;
    mat.uniforms.uHat!.value = hatSmooth.current;
    mat.uniforms.uTenderness!.value = tenderSmooth.current;
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
