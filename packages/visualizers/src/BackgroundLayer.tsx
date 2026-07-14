'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useMetricsRef } from './metrics';
import { getDotTexture } from './dotTexture';

/**
 * BackgroundLayer — the always-subtle reactive backdrop.
 *
 * Fills the navy void behind the hero preset with slow, contrast-capped
 * beauty that reacts to the music without ever competing with the
 * foreground. Rendered at deep negative Z with additive, depth-write-off
 * materials so it sits firmly behind everything.
 *
 * Driven mostly by SLOW signals (`breath`, `flow`, `moodValence`,
 * `dropEvent`) so the background drifts and swells rather than strobing.
 * Honors `prefers-reduced-motion` by freezing the drift.
 *
 * This is intentionally shaped as the first schema-driven "scene node":
 * an explicit, serializable props bag (`mode`, `intensity`, `palette`)
 * that the future builder can route and edit.
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
const NEBULA_CAP = 0.34;
const AURORA_CAP = 0.4;
const GLOW_CAP = 0.36;
const STAR_OPACITY_CAP = 0.62;

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

// Shared GLSL fbm noise used by the shader-based modes.
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
`;

const FULLSCREEN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// ---------------------------------------------------------------------------
// Nebula — drifting fbm fog tinted by palette + mood valence.
// ---------------------------------------------------------------------------

const NEBULA_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uIntensity;
  varying vec2 vUv;
  ${NOISE_GLSL}
  void main() {
    vec2 p = vUv * 3.0;
    float n1 = fbm(p + vec2(uTime * 0.02, uTime * 0.015));
    float n2 = fbm(p * 1.7 - vec2(uTime * 0.012, uTime * 0.008));
    float density = smoothstep(0.25, 0.95, n1 * 0.6 + n2 * 0.4);
    vec3 col = mix(uColorA, uColorB, n2);
    // Vignette into black at the edges so it never forms a hard rectangle.
    float edge = smoothstep(1.05, 0.35, length(vUv - 0.5));
    float a = density * edge * uIntensity;
    gl_FragColor = vec4(col, a);
  }
`;

function Nebula({ intensity, palette, reducedMotion }: ModeProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const metricsRef = useMetricsRef();
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(palette.bass) },
      uColorB: { value: new THREE.Color(palette.mid) },
      uIntensity: { value: 0 },
    }),
    [palette.bass, palette.mid],
  );
  const timeRef = useRef(0);

  useFrame((_s, delta) => {
    const m = metricsRef.current;
    timeRef.current += reducedMotion ? 0 : Math.min(delta, 0.1);
    const mat = matRef.current;
    if (!mat) return;
    mat.uniforms.uTime!.value = timeRef.current;
    // Slow swell: breath + flow, gentle drop bump. Capped hard.
    const swell = 0.4 + m.breath * 0.5 + m.flow * 0.35 + m.dropEvent * 0.25;
    mat.uniforms.uIntensity!.value = Math.min(NEBULA_CAP, swell * intensity * NEBULA_CAP);
    // Live palette: both fog colors track the (mutating) palette per frame.
    (mat.uniforms.uColorA!.value as THREE.Color).set(palette.bass);
    // Warm/cool drift toward the high color on positive valence.
    const warmth = Math.max(0, Math.min(1, 0.5 + m.moodValence * 0.4));
    (mat.uniforms.uColorB!.value as THREE.Color).lerpColors(
      new THREE.Color(palette.mid),
      new THREE.Color(palette.high),
      warmth * 0.6,
    );
  });

  return (
    <mesh position={[0, 0, -8]} renderOrder={-10}>
      <planeGeometry args={[34, 22]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={FULLSCREEN_VERTEX}
        fragmentShader={NEBULA_FRAGMENT}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Starfield — deep parallax stars, twinkle on highs.
// ---------------------------------------------------------------------------

const STAR_COUNT_HIGH = 900;
const STAR_COUNT_MID = 450;
const STAR_COUNT_LOW = 180;

function Starfield({ intensity, palette, tier, reducedMotion }: ModeProps) {
  const groupRef = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);
  const metricsRef = useMetricsRef();
  const scratchMid = useRef(new THREE.Color());
  const scratchHigh = useRef(new THREE.Color());
  const sprite = useMemo(() => getDotTexture(), []);
  const count = tier === 'high' ? STAR_COUNT_HIGH : tier === 'mid' ? STAR_COUNT_MID : STAR_COUNT_LOW;

  const { positions, colors, starBand, starVariance } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const band = new Uint8Array(count);
    const variance = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Spread across a wide deep slab behind the scene.
      pos[i * 3] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 26;
      pos[i * 3 + 2] = -10 - Math.random() * 8;
      band[i] = Math.random() < 0.7 ? 1 : 0;
      // Slight per-star brightness variance, applied at tint time.
      variance[i] = 0.5 + Math.random() * 0.5;
    }
    return { positions: pos, colors: col, starBand: band, starVariance: variance };
  }, [count]);

  useFrame((_s, delta) => {
    const m = metricsRef.current;
    const g = groupRef.current;
    if (g && !reducedMotion) {
      // Very slow parallax rotation — deep-space drift.
      g.rotation.z += delta * 0.005;
    }
    const mat = matRef.current;
    if (mat) {
      // Twinkle: base size + high-frequency sparkle. Opacity capped.
      mat.size = 0.06 + m.high * 0.14;
      mat.opacity = Math.min(STAR_OPACITY_CAP, (0.3 + m.high * 0.4 + m.flow * 0.15) * intensity);
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
    <points ref={groupRef} renderOrder={-10}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={count} itemSize={3} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} count={count} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        ref={matRef}
        size={0.08}
        map={sprite}
        sizeAttenuation
        transparent
        opacity={0.4}
        vertexColors
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ---------------------------------------------------------------------------
// Aurora — low-anchored shimmering curtains, bass-driven.
// ---------------------------------------------------------------------------

const AURORA_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uIntensity;
  varying vec2 vUv;
  ${NOISE_GLSL}
  void main() {
    // Wavy top edge of the curtain, anchored to the bottom of the frame.
    float topEdge = 0.35 + 0.28 * fbm(vec2(vUv.x * 3.0 + uTime * 0.05, 1.7));
    float curtain = smoothstep(topEdge, topEdge - 0.55, vUv.y);
    // Vertical shimmer striations that scroll horizontally.
    float shimmer = 0.55 + 0.45 * fbm(vec2(vUv.x * 9.0, vUv.y * 2.0 + uTime * 0.18));
    vec3 col = mix(uColorA, uColorB, vUv.y + 0.2 * fbm(vec2(vUv.x * 5.0, uTime * 0.1)));
    // Soft horizontal fade at left/right edges.
    float edge = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
    float a = curtain * shimmer * edge * uIntensity;
    gl_FragColor = vec4(col, a);
  }
`;

function Aurora({ intensity, palette, reducedMotion }: ModeProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const metricsRef = useMetricsRef();
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(palette.bass) },
      uColorB: { value: new THREE.Color(palette.high) },
      uIntensity: { value: 0 },
    }),
    [palette.bass, palette.high],
  );
  const timeRef = useRef(0);
  const levelRef = useRef(0);

  useFrame((_s, delta) => {
    const m = metricsRef.current;
    const dt = Math.min(delta, 0.1);
    timeRef.current += reducedMotion ? 0 : dt;
    // Smooth the bass drive so curtains billow rather than flicker.
    const target = 0.35 + m.bass * 0.6 + m.breath * 0.4 + m.dropEvent * 0.3;
    levelRef.current += (target - levelRef.current) * (1 - Math.exp(-dt / 0.4));
    const mat = matRef.current;
    if (!mat) return;
    mat.uniforms.uTime!.value = timeRef.current;
    mat.uniforms.uIntensity!.value = Math.min(AURORA_CAP, levelRef.current * intensity * AURORA_CAP);
    // Live palette: curtain colors track the (mutating) palette per frame.
    (mat.uniforms.uColorA!.value as THREE.Color).set(palette.bass);
    (mat.uniforms.uColorB!.value as THREE.Color).set(palette.high);
  });

  return (
    <mesh position={[0, 0, -7.5]} renderOrder={-10}>
      <planeGeometry args={[34, 22]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={FULLSCREEN_VERTEX}
        fragmentShader={AURORA_FRAGMENT}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Glow — soft radial energy bloom that breathes with the music.
// ---------------------------------------------------------------------------

const GLOW_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - 0.5;
    float d = length(p) / 0.5;
    float a = (1.0 - smoothstep(0.0, 1.0, d)) * uIntensity;
    gl_FragColor = vec4(uColor, a);
  }
`;

function Glow({ intensity, palette, reducedMotion }: ModeProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const metricsRef = useMetricsRef();
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(palette.mid) },
      uIntensity: { value: 0 },
    }),
    [palette.mid],
  );
  const tRef = useRef(0);

  useFrame((_s, delta) => {
    const m = metricsRef.current;
    tRef.current += reducedMotion ? 0 : Math.min(delta, 0.1);
    const mat = matRef.current;
    if (!mat) return;
    // Slow autonomous breath plus energy swell; drops punch softly through.
    const autoBreath = 0.45 + 0.12 * Math.sin(tRef.current * 0.4);
    const swell = autoBreath + m.flow * 0.5 + m.bass * 0.3 + m.dropEvent * 0.4;
    const silenceMute = 1 - m.silence * 0.5;
    mat.uniforms.uIntensity!.value = Math.min(GLOW_CAP, swell * silenceMute * intensity * GLOW_CAP);
    // Warm vs cool target color follows mood valence.
    const warmth = Math.max(0, Math.min(1, 0.5 + m.moodValence * 0.4));
    (mat.uniforms.uColor!.value as THREE.Color).lerpColors(
      new THREE.Color(palette.bass),
      new THREE.Color(palette.mid),
      warmth,
    );
  });

  return (
    <mesh position={[0, 0, -7]} renderOrder={-10}>
      <planeGeometry args={[26, 26]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={FULLSCREEN_VERTEX}
        fragmentShader={GLOW_FRAGMENT}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}
