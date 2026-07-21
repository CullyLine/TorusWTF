'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useMetricsRef } from './metrics';
import { getDotTexture } from './dotTexture';

/**
 * BackgroundLayer — the always-subtle reactive backdrop.
 *
 * Every mode is a true 360° environment (sky spheres / spherical star
 * shells), not a flat card: whichever way the camera flies — orbit,
 * cinematic sweeps, flow-riding — the backdrop is there. Shader modes
 * compute color from the per-pixel WORLD DIRECTION on an inward-facing
 * sphere, so there are no seams, no edges, and no "back of the set".
 *
 * Driven mostly by SLOW signals (`breath`, `flow`, `moodValence`,
 * `dropEvent`, `afterglow`, `tension`) so the background drifts and
 * swells rather than strobing. Pre-beat `gather` eases the sky inward /
 * dim (musical inhale); `shimmer`/`hat` add a faint glitter distinct
 * from bass swell. While `afterglow` decays, nebula/aurora/glow bias
 * toward a warmer amber mix — intensity afterglow stays; this is the
 * color-temperature residue of a big moment. Honors
 * `prefers-reduced-motion` by freezing the drift. Contrast-capped so it
 * never competes with the foreground preset.
 */

export type BackgroundMode = 'none' | 'nebula' | 'starfield' | 'aurora' | 'glow';

export const BACKGROUND_MODES: BackgroundMode[] = [
  'none',
  'nebula',
  'starfield',
  'aurora',
  'glow',
];

export interface BackgroundLayerProps {
  mode: BackgroundMode;
  /** Master visibility 0..1. Default 0.6. Always contrast-capped on top. */
  intensity?: number;
  palette: { bass: string; mid: string; high: string };
  tier: 'high' | 'mid' | 'low';
}

// Contrast caps per mode — the hard ceiling on how loud the background can
// ever get, so it stays a background no matter the intensity slider.
// (Raised slightly vs the old flat-card versions: the same energy budget
// spread across a full sky sphere reads dimmer per pixel.)
const NEBULA_CAP = 0.42;
const AURORA_CAP = 0.5;
const GLOW_CAP = 0.42;
const STAR_OPACITY_CAP = 0.68;

/**
 * Amber residue mixed into sky colors while afterglow decays.
 * Max mix at afterglow=1 — visible warmth, not a full wash.
 */
const AFTERGLOW_AMBER = new THREE.Color(1.0, 0.58, 0.28);
const AFTERGLOW_WARMTH_MIX = 0.42;
/** Ease tau for color-temperature linger (fluid, not stair-stepped). */
const AFTERGLOW_WARMTH_TAU = 0.35;

/** Sky sphere radius: far outside every camera path (max ~12 world units). */
const SKY_RADIUS = 50;

/** Bias a sky color toward amber by eased afterglow; quiet (0) is a no-op. */
function applyAfterglowWarmth(
  color: THREE.Color,
  warmthLinger: number,
  scratchAmber: THREE.Color,
): void {
  const t = Math.max(0, Math.min(1, warmthLinger)) * AFTERGLOW_WARMTH_MIX;
  if (t < 0.001) return;
  color.lerp(scratchAmber.copy(AFTERGLOW_AMBER), t);
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

export function BackgroundLayer({ mode, intensity = 0.6, palette, tier }: BackgroundLayerProps) {
  const reducedMotion = usePrefersReducedMotion();
  if (mode === 'none') return null;
  const common = { intensity, palette, tier, reducedMotion };
  switch (mode) {
    case 'nebula':
      return <Nebula {...common} />;
    case 'starfield':
      return <Starfield {...common} />;
    case 'aurora':
      return <Aurora {...common} />;
    case 'glow':
      return <Glow {...common} />;
    default:
      return null;
  }
}

interface ModeProps {
  intensity: number;
  palette: { bass: string; mid: string; high: string };
  tier: 'high' | 'mid' | 'low';
  reducedMotion: boolean;
}

// Shared GLSL: 2D fbm noise + a seamless direction-domain fbm that blends
// three axis projections (triplanar-on-the-sphere), so sky patterns have
// no pole pinching and no wrap seam anywhere.
const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
    return v;
  }
  float fbmDir(vec3 d, float s, vec2 drift) {
    vec3 w = abs(d);
    w /= (w.x + w.y + w.z);
    return fbm(d.yz * s + drift) * w.x
         + fbm(d.xz * s + drift * 1.13) * w.y
         + fbm(d.xy * s + drift * 0.87) * w.z;
  }
`;

// Sky vertex shader: pass the world-space view direction for this fragment.
// The sphere is camera-agnostic — direction is (worldPos - cameraPos), so
// turning or flying the camera reveals the rest of a coherent sky.
const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vDir = normalize(wp.xyz - cameraPosition);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

interface SkySphereProps {
  matRef: React.RefObject<THREE.ShaderMaterial | null>;
  fragment: string;
  uniforms: Record<string, THREE.IUniform>;
}

/** Inward-facing sphere shared by all shader sky modes. */
function SkySphere({ matRef, fragment, uniforms }: SkySphereProps) {
  return (
    <mesh renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[SKY_RADIUS, 48, 32]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={SKY_VERTEX}
        fragmentShader={fragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        depthTest
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Nebula — drifting fbm fog wrapped around the whole sky.
// ---------------------------------------------------------------------------

const NEBULA_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uIntensity;
  uniform float uInhale;
  uniform float uGlitter;
  varying vec3 vDir;
  ${NOISE_GLSL}
  void main() {
    vec3 d = normalize(vDir);
    float n1 = fbmDir(d, 2.6, vec2(uTime * 0.020, uTime * 0.015));
    float n2 = fbmDir(d, 4.4, vec2(-uTime * 0.012, uTime * 0.008));
    // Gather raises the density floor so fog thins / pulls toward denser
    // pockets — a pre-beat inhale instead of a flat dim.
    float lo = 0.28 + uInhale * 0.16;
    float hi = 0.95 + uInhale * 0.04;
    float density = smoothstep(lo, hi, n1 * 0.62 + n2 * 0.38);
    vec3 col = mix(uColorA, uColorB, n2);
    // Slightly thinner straight overhead/underfoot so the fog reads as a
    // horizon-hugging cloudscape instead of a uniform wash.
    float band = 1.0 - 0.35 * abs(d.y) - uInhale * 0.18 * (1.0 - abs(d.y));
    // Hat/shimmer glitter: brief high-frequency sparkle, not bass swell.
    float sparkle = noise(d.xy * 38.0 + vec2(uTime * 9.0, uTime * 6.5));
    float glitter = 1.0 + uGlitter * (0.25 + 0.75 * sparkle);
    float a = density * band * uIntensity * (1.0 - uInhale * 0.28) * glitter;
    gl_FragColor = vec4(col, a);
  }
`;

function Nebula({ intensity, palette, reducedMotion }: ModeProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const metricsRef = useMetricsRef();
  const scratchMid = useRef(new THREE.Color());
  const scratchHigh = useRef(new THREE.Color());
  const scratchAmber = useRef(new THREE.Color());
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(palette.bass) },
      uColorB: { value: new THREE.Color(palette.mid) },
      uIntensity: { value: 0 },
      uInhale: { value: 0 },
      uGlitter: { value: 0 },
    }),
    [palette.bass, palette.mid],
  );
  const timeRef = useRef(0);
  const inhaleRef = useRef(0);
  const glitterRef = useRef(0);
  const warmthLingerRef = useRef(0);

  useFrame((_s, delta) => {
    const m = metricsRef.current;
    const dt = Math.min(delta, 0.1);
    timeRef.current += reducedMotion ? 0 : dt;
    const mat = matRef.current;
    if (!mat) return;
    mat.uniforms.uTime!.value = timeRef.current;
    // Slow swell: breath + flow + build tension + lingering afterglow.
    const swell =
      0.4 +
      m.breath * 0.5 +
      m.flow * 0.35 +
      m.tension * 0.42 +
      m.dropEvent * 0.25 +
      m.afterglow * 0.2;
    mat.uniforms.uIntensity!.value = Math.min(NEBULA_CAP, swell * intensity * NEBULA_CAP);
    // Ease gather/glitter so the sky inhales and sparkles fluidly.
    inhaleRef.current += (m.gather - inhaleRef.current) * (1 - Math.exp(-dt / 0.12));
    const glitterTarget = Math.min(1, m.shimmer * 0.9 + m.hat * 0.55);
    const glitterTau = glitterTarget > glitterRef.current ? 0.05 : 0.22;
    glitterRef.current +=
      (glitterTarget - glitterRef.current) * (1 - Math.exp(-dt / glitterTau));
    // Color-temperature linger tracks afterglow (intensity path unchanged).
    warmthLingerRef.current +=
      (m.afterglow - warmthLingerRef.current) * (1 - Math.exp(-dt / AFTERGLOW_WARMTH_TAU));
    mat.uniforms.uInhale!.value = inhaleRef.current;
    mat.uniforms.uGlitter!.value = glitterRef.current;
    // Live palette: both fog colors track the (mutating) palette per frame.
    const colorA = mat.uniforms.uColorA!.value as THREE.Color;
    colorA.set(palette.bass);
    // Warm/cool drift toward the high color on positive valence.
    const warmth = Math.max(0, Math.min(1, 0.5 + m.moodValence * 0.4));
    const colorB = mat.uniforms.uColorB!.value as THREE.Color;
    colorB.lerpColors(
      scratchMid.current.set(palette.mid),
      scratchHigh.current.set(palette.high),
      warmth * 0.6,
    );
    // Big-moment amber residue — quiet afterglow leaves palette untinted.
    applyAfterglowWarmth(colorA, warmthLingerRef.current, scratchAmber.current);
    applyAfterglowWarmth(colorB, warmthLingerRef.current, scratchAmber.current);
  });

  return <SkySphere matRef={matRef} fragment={NEBULA_FRAGMENT} uniforms={uniforms} />;
}

// ---------------------------------------------------------------------------
// Starfield — full spherical shell of stars, twinkle on highs.
// ---------------------------------------------------------------------------

const STAR_COUNT_HIGH = 1400;
const STAR_COUNT_MID = 700;
const STAR_COUNT_LOW = 280;

function Starfield({ intensity, palette, tier, reducedMotion }: ModeProps) {
  const groupRef = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);
  const metricsRef = useMetricsRef();
  const scratchMid = useRef(new THREE.Color());
  const scratchHigh = useRef(new THREE.Color());
  const inhaleRef = useRef(0);
  const glitterRef = useRef(0);
  const sprite = useMemo(() => getDotTexture(), []);
  const count = tier === 'high' ? STAR_COUNT_HIGH : tier === 'mid' ? STAR_COUNT_MID : STAR_COUNT_LOW;

  const { positions, colors, starBand, starVariance } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const band = new Uint8Array(count);
    const variance = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Uniform random direction (normalized gaussian) × a deep shell
      // radius — stars surround the camera in every direction.
      let x = 0;
      let y = 0;
      let z = 0;
      let len = 0;
      do {
        x = Math.random() * 2 - 1;
        y = Math.random() * 2 - 1;
        z = Math.random() * 2 - 1;
        len = Math.hypot(x, y, z);
      } while (len < 0.05 || len > 1);
      const r = 26 + Math.random() * 16;
      pos[i * 3] = (x / len) * r;
      pos[i * 3 + 1] = (y / len) * r;
      pos[i * 3 + 2] = (z / len) * r;
      band[i] = Math.random() < 0.7 ? 1 : 0;
      // Slight per-star brightness variance, applied at tint time.
      variance[i] = 0.5 + Math.random() * 0.5;
    }
    return { positions: pos, colors: col, starBand: band, starVariance: variance };
  }, [count]);

  useFrame((_s, delta) => {
    const m = metricsRef.current;
    const dt = Math.min(delta, 0.1);
    const g = groupRef.current;
    if (g && !reducedMotion) {
      // Very slow whole-sky rotation — deep-space drift.
      g.rotation.y += delta * 0.004;
      g.rotation.z += delta * 0.002;
    }
    inhaleRef.current += (m.gather - inhaleRef.current) * (1 - Math.exp(-dt / 0.12));
    const glitterTarget = Math.min(1, m.shimmer * 0.95 + m.hat * 0.6);
    const glitterTau = glitterTarget > glitterRef.current ? 0.04 : 0.18;
    glitterRef.current +=
      (glitterTarget - glitterRef.current) * (1 - Math.exp(-dt / glitterTau));
    const mat = matRef.current;
    if (mat) {
      // Twinkle: base size + high-frequency sparkle. Opacity capped.
      // Sized up ~4x vs the old near-slab because the shell sits ~30
      // units out (point size attenuates with distance).
      // Gather dims the field; tension swells through builds; shimmer/hat
      // glitter is a sharp tick distinct from bass flow.
      const gatherDim = 1 - inhaleRef.current * 0.32;
      mat.size = 0.26 + m.high * 0.45 + glitterRef.current * 0.38;
      mat.opacity = Math.min(
        STAR_OPACITY_CAP,
        (0.3 +
          m.high * 0.35 +
          m.flow * 0.15 +
          m.tension * 0.22 +
          glitterRef.current * 0.28) *
          intensity *
          gatherDim,
      );
    }
    // Live palette: stars re-tint per frame so they follow color life.
    if (g) {
      const cAttr = g.geometry.getAttribute('color') as THREE.BufferAttribute;
      const cArr = cAttr.array as Float32Array;
      const midC = scratchMid.current.set(palette.mid);
      const highC = scratchHigh.current.set(palette.high);
      for (let i = 0; i < count; i++) {
        const c = starBand[i] === 1 ? highC : midC;
        const v = starVariance[i]!;
        cArr[i * 3] = c.r * v;
        cArr[i * 3 + 1] = c.g * v;
        cArr[i * 3 + 2] = c.b * v;
      }
      cAttr.needsUpdate = true;
    }
  });

  return (
    <points ref={groupRef} renderOrder={-10} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={count} itemSize={3} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} count={count} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        ref={matRef}
        size={0.3}
        map={sprite}
        sizeAttenuation
        transparent
        opacity={0.4}
        vertexColors
        depthWrite={false}
        depthTest
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ---------------------------------------------------------------------------
// Aurora — shimmering curtains wrapping the full horizon, bass-driven.
// ---------------------------------------------------------------------------

const AURORA_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uIntensity;
  uniform float uInhale;
  uniform float uGlitter;
  varying vec3 vDir;
  ${NOISE_GLSL}
  void main() {
    vec3 d = normalize(vDir);
    // Horizontal domain (seam-free): the direction's x/z components,
    // ignoring elevation — curtains wrap 360° around the viewer.
    vec3 flat3 = normalize(vec3(d.x, 0.0, d.z) + 1e-4);
    // Wavy top edge of the curtain, different at every compass heading.
    float wave = fbmDir(flat3, 2.4, vec2(uTime * 0.05, 0.0));
    // Gather drops the curtain edge toward the horizon (inward inhale).
    float topEdge = 0.16 + 0.34 * wave - uInhale * 0.14;
    // Curtain: bright ribbon below its wavy top edge, fading out toward
    // the nadir so it hugs the horizon like the real thing.
    float curtain = smoothstep(topEdge, topEdge - 0.55, d.y) * smoothstep(-0.75, -0.25, d.y);
    // Vertical shimmer striations that scroll around the horizon.
    float shimmer = 0.55 + 0.45 * fbmDir(d, 7.0, vec2(uTime * 0.18, uTime * 0.06));
    // Hat glitter: sharp sparkle ticks on the curtain, not bass billow.
    float sparkle = noise(d.xz * 52.0 + vec2(uTime * 11.0, -uTime * 7.0));
    shimmer += uGlitter * (0.35 + 0.65 * sparkle);
    float hueBand = clamp(d.y * 1.3 + 0.55, 0.0, 1.0);
    vec3 col = mix(uColorA, uColorB, hueBand + 0.2 * wave);
    float a = curtain * shimmer * uIntensity * (1.0 - uInhale * 0.38);
    gl_FragColor = vec4(col, a);
  }
`;

function Aurora({ intensity, palette, reducedMotion }: ModeProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const metricsRef = useMetricsRef();
  const scratchAmber = useRef(new THREE.Color());
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(palette.bass) },
      uColorB: { value: new THREE.Color(palette.high) },
      uIntensity: { value: 0 },
      uInhale: { value: 0 },
      uGlitter: { value: 0 },
    }),
    [palette.bass, palette.high],
  );
  const timeRef = useRef(0);
  const levelRef = useRef(0);
  const inhaleRef = useRef(0);
  const glitterRef = useRef(0);
  const warmthLingerRef = useRef(0);

  useFrame((_s, delta) => {
    const m = metricsRef.current;
    const dt = Math.min(delta, 0.1);
    timeRef.current += reducedMotion ? 0 : dt;
    // Smooth the bass drive so curtains billow rather than flicker.
    // Tension swells through builds on top of the slow breath.
    const target =
      0.35 +
      m.bass * 0.6 +
      m.breath * 0.4 +
      m.tension * 0.48 +
      m.dropEvent * 0.3 +
      m.afterglow * 0.25;
    levelRef.current += (target - levelRef.current) * (1 - Math.exp(-dt / 0.4));
    inhaleRef.current += (m.gather - inhaleRef.current) * (1 - Math.exp(-dt / 0.12));
    const glitterTarget = Math.min(1, m.shimmer * 0.9 + m.hat * 0.55);
    const glitterTau = glitterTarget > glitterRef.current ? 0.05 : 0.2;
    glitterRef.current +=
      (glitterTarget - glitterRef.current) * (1 - Math.exp(-dt / glitterTau));
    warmthLingerRef.current +=
      (m.afterglow - warmthLingerRef.current) * (1 - Math.exp(-dt / AFTERGLOW_WARMTH_TAU));
    const mat = matRef.current;
    if (!mat) return;
    mat.uniforms.uTime!.value = timeRef.current;
    mat.uniforms.uIntensity!.value = Math.min(AURORA_CAP, levelRef.current * intensity * AURORA_CAP);
    mat.uniforms.uInhale!.value = inhaleRef.current;
    mat.uniforms.uGlitter!.value = glitterRef.current;
    // Live palette: curtain colors track the (mutating) palette per frame.
    const colorA = mat.uniforms.uColorA!.value as THREE.Color;
    const colorB = mat.uniforms.uColorB!.value as THREE.Color;
    colorA.set(palette.bass);
    colorB.set(palette.high);
    applyAfterglowWarmth(colorA, warmthLingerRef.current, scratchAmber.current);
    applyAfterglowWarmth(colorB, warmthLingerRef.current, scratchAmber.current);
  });

  return <SkySphere matRef={matRef} fragment={AURORA_FRAGMENT} uniforms={uniforms} />;
}

// ---------------------------------------------------------------------------
// Glow — a soft energy source that slowly orbits the sky and breathes.
// ---------------------------------------------------------------------------

const GLOW_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uSunDir;
  uniform float uIntensity;
  uniform float uInhale;
  uniform float uGlitter;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    // Wide soft halo around the drifting energy source...
    // Gather tightens the core (inward inhale) instead of only dimming.
    float core = pow(max(dot(d, uSunDir), 0.0), 3.0 + uInhale * 2.2);
    // ...plus a faint horizon glow so the rest of the sky isn't dead.
    float horizon = (1.0 - abs(d.y)) * 0.18 * (1.0 - uInhale * 0.35);
    float sparkle = fract(sin(dot(d.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float glitter = 1.0 + uGlitter * (0.2 + 0.8 * sparkle);
    float a = (core + horizon) * uIntensity * (1.0 - uInhale * 0.3) * glitter;
    gl_FragColor = vec4(uColor, a);
  }
`;

function Glow({ intensity, palette, reducedMotion }: ModeProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const metricsRef = useMetricsRef();
  const scratchBass = useRef(new THREE.Color());
  const scratchMid = useRef(new THREE.Color());
  const scratchAmber = useRef(new THREE.Color());
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(palette.mid) },
      uSunDir: { value: new THREE.Vector3(0, 0.2, -1).normalize() },
      uIntensity: { value: 0 },
      uInhale: { value: 0 },
      uGlitter: { value: 0 },
    }),
    [palette.mid],
  );
  const tRef = useRef(0);
  const inhaleRef = useRef(0);
  const glitterRef = useRef(0);
  const warmthLingerRef = useRef(0);

  useFrame((_s, delta) => {
    const m = metricsRef.current;
    const dt = Math.min(delta, 0.1);
    tRef.current += reducedMotion ? 0 : dt;
    const mat = matRef.current;
    if (!mat) return;
    // The energy source drifts around the sky over ~4 minutes and bobs
    // gently in elevation — walking around it (orbit/flow cameras) works.
    const az = tRef.current * 0.026;
    const el = 0.15 + Math.sin(tRef.current * 0.05) * 0.25;
    (mat.uniforms.uSunDir!.value as THREE.Vector3)
      .set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el))
      .normalize();
    // Slow autonomous breath plus energy swell; tension builds; drops punch.
    const autoBreath = 0.45 + 0.12 * Math.sin(tRef.current * 0.4);
    const swell =
      autoBreath +
      m.flow * 0.5 +
      m.bass * 0.3 +
      m.tension * 0.4 +
      m.dropEvent * 0.4 +
      m.afterglow * 0.3;
    const silenceMute = 1 - m.silence * 0.5;
    inhaleRef.current += (m.gather - inhaleRef.current) * (1 - Math.exp(-dt / 0.12));
    const glitterTarget = Math.min(1, m.shimmer * 0.85 + m.hat * 0.5);
    const glitterTau = glitterTarget > glitterRef.current ? 0.05 : 0.22;
    glitterRef.current +=
      (glitterTarget - glitterRef.current) * (1 - Math.exp(-dt / glitterTau));
    warmthLingerRef.current +=
      (m.afterglow - warmthLingerRef.current) * (1 - Math.exp(-dt / AFTERGLOW_WARMTH_TAU));
    mat.uniforms.uIntensity!.value = Math.min(GLOW_CAP, swell * silenceMute * intensity * GLOW_CAP);
    mat.uniforms.uInhale!.value = inhaleRef.current;
    mat.uniforms.uGlitter!.value = glitterRef.current;
    // Warm vs cool target color follows mood valence.
    const warmth = Math.max(0, Math.min(1, 0.5 + m.moodValence * 0.4));
    const color = mat.uniforms.uColor!.value as THREE.Color;
    color.lerpColors(
      scratchBass.current.set(palette.bass),
      scratchMid.current.set(palette.mid),
      warmth,
    );
    applyAfterglowWarmth(color, warmthLingerRef.current, scratchAmber.current);
  });

  return <SkySphere matRef={matRef} fragment={GLOW_FRAGMENT} uniforms={uniforms} />;
}
