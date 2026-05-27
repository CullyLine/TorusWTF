'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useMetricsRef } from './metrics';

/**
 * Aura — the persistent presence layer.
 *
 * Two parts, both rendered behind every preset:
 *  - wisps:    ~200 small drifting motes that wander on Perlin-like paths
 *  - soulGlow: a soft persistent radial halo that breathes with audio energy
 *
 * Both exist regardless of audio source. With music they brighten and
 * cluster; in silence they keep drifting like dust in a beam of light.
 */

interface AuraLayerProps {
  palette: { bass: string; mid: string; high: string };
  /** 0 = no aura, 1 = full presence. Default 0.4. */
  amount?: number;
  tier: 'high' | 'mid' | 'low';
}

const WISP_COUNT_HIGH = 280;
const WISP_COUNT_MID = 160;
const WISP_COUNT_LOW = 60;

export function AuraLayer({ palette, amount = 0.4, tier }: AuraLayerProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const glowMatRef = useRef<THREE.ShaderMaterial>(null);
  const metricsRef = useMetricsRef();

  const wispCount = tier === 'high' ? WISP_COUNT_HIGH : tier === 'mid' ? WISP_COUNT_MID : WISP_COUNT_LOW;

  // Per-wisp seeds for stable trajectory + per-wisp brightness phase offset.
  const { positions, seeds, colors } = useMemo(() => {
    const pos = new Float32Array(wispCount * 3);
    const seed = new Float32Array(wispCount * 4);
    const col = new Float32Array(wispCount * 3);
    const bass = new THREE.Color(palette.bass);
    const mid = new THREE.Color(palette.mid);
    const high = new THREE.Color(palette.high);
    for (let i = 0; i < wispCount; i++) {
      // Spawn in a sphere around the camera-facing region.
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 2 + Math.random() * 3;
      pos[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      pos[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * r;
      pos[i * 3 + 2] = Math.cos(phi) * r - 1.5;
      // Per-wisp trajectory seeds (sin frequencies for x/y/z + brightness phase).
      seed[i * 4] = 0.05 + Math.random() * 0.12;
      seed[i * 4 + 1] = 0.05 + Math.random() * 0.12;
      seed[i * 4 + 2] = 0.05 + Math.random() * 0.12;
      seed[i * 4 + 3] = Math.random() * Math.PI * 2;
      // Color: a tertiary mix biased toward mid (rare bass/high wisps).
      const pick = Math.random();
      const c = pick < 0.2 ? bass : pick < 0.85 ? mid : high;
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    return { positions: pos, seeds: seed, colors: col };
  }, [wispCount, palette.bass, palette.mid, palette.high]);

  // Soul glow shader: a soft radial gradient that breathes with audio.
  const glowUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(palette.mid) },
      uIntensity: { value: 0.0 },
      uRadius: { value: 1.0 },
    }),
    [palette.mid],
  );

  const glowVertex = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const glowFragment = /* glsl */ `
    uniform vec3 uColor;
    uniform float uIntensity;
    uniform float uRadius;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv - 0.5;
      float d = length(p) / 0.5;
      // Soft falloff, never fully transparent at center, vanishes by edge.
      float a = (1.0 - smoothstep(0.0, uRadius, d)) * uIntensity;
      gl_FragColor = vec4(uColor, a);
    }
  `;

  useFrame((_state, delta) => {
    if (amount <= 0) return;
    const m = metricsRef.current;
    const now = performance.now() / 1000;

    // Update wisp positions (gentle Perlin-style drift).
    const points = pointsRef.current;
    const mat = matRef.current;
    if (points && mat) {
      const posAttr = points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      for (let i = 0; i < wispCount; i++) {
        const fx = seeds[i * 4]!;
        const fy = seeds[i * 4 + 1]!;
        const fz = seeds[i * 4 + 2]!;
        // Drift along a wandering path. Bass slightly amplifies vertical motion
        // so the cloud "swells" subtly with the kick.
        arr[i * 3] = (arr[i * 3] ?? 0) + Math.sin(now * fx + i * 0.13) * delta * 0.08;
        arr[i * 3 + 1] = (arr[i * 3 + 1] ?? 0) + Math.cos(now * fy + i * 0.17) * delta * 0.06 * (1 + m.bass * 0.4);
        arr[i * 3 + 2] = (arr[i * 3 + 2] ?? 0) + Math.sin(now * fz + i * 0.21) * delta * 0.04;
        // Soft attractor back toward spawn region so wisps don't escape.
        const x = arr[i * 3]!;
        const y = arr[i * 3 + 1]!;
        const z = arr[i * 3 + 2]!;
        const r = Math.sqrt(x * x + y * y + z * z);
        if (r > 6) {
          const pull = (r - 6) * delta * 0.5;
          arr[i * 3] = x - (x / r) * pull;
          arr[i * 3 + 1] = y - (y / r) * pull;
          arr[i * 3 + 2] = z - (z / r) * pull;
        }
      }
      posAttr.needsUpdate = true;
      // Wisp brightness pulses with high frequencies; opacity scales with amount.
      mat.size = (0.04 + m.high * 0.12) * (0.7 + amount * 0.3);
      mat.opacity = (0.25 + m.high * 0.5 + m.flow * 0.15) * amount;
    }

    // Soul glow breathes with energy + a slow autonomous pulse (the heartbeat
    // is also handled in SceneRig as camera breath; here it just keeps glow alive).
    const glowMat = glowMatRef.current;
    if (glowMat) {
      const autoBreath = 0.18 + 0.06 * Math.sin(now * 0.4);
      glowMat.uniforms.uIntensity!.value = (autoBreath + m.bass * 0.5 + m.beat * 0.3) * amount;
      (glowMat.uniforms.uColor!.value as THREE.Color).lerpColors(
        new THREE.Color(palette.bass),
        new THREE.Color(palette.mid),
        0.5 + m.mid * 0.3,
      );
    }
  });

  if (amount <= 0) return null;

  return (
    <>
      {/* Soul glow: large fullscreen-ish plane positioned behind everything. */}
      <mesh ref={glowRef} position={[0, 0, -3]}>
        <planeGeometry args={[12, 12]} />
        <shaderMaterial
          ref={glowMatRef}
          vertexShader={glowVertex}
          fragmentShader={glowFragment}
          uniforms={glowUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Wisp particle cloud. */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
            count={wispCount}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[colors, 3]}
            count={wispCount}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          ref={matRef}
          size={0.06}
          sizeAttenuation
          transparent
          opacity={0.3}
          vertexColors
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* Suppress unused-seed warning by referencing it as a comment uniform. */}
      {/* (seeds array is used inside useFrame above; this fragment is intentionally empty.) */}
    </>
  );
}
