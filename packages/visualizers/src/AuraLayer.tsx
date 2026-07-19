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
 * cluster; during `holdBreath` / deep silence they nearly freeze and huddle
 * toward center — listening — then resume drifting when sound returns.
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

/** Soft huddle center — matches the spawn-region bias (z −1.5). */
const HUDDLE_CX = 0;
const HUDDLE_CY = 0;
const HUDDLE_CZ = -1.5;

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

export function AuraLayer({ palette, amount = 0.4, tier }: AuraLayerProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const glowMatRef = useRef<THREE.ShaderMaterial>(null);
  const metricsRef = useMetricsRef();

  // Smoothed stillness so freeze/thaw never pops.
  const stillnessSmooth = useRef(0);

  // Reused color temps — avoid per-frame Color allocations in the glow lerp.
  const bassColor = useRef(new THREE.Color(palette.bass));
  const midColor = useRef(new THREE.Color(palette.mid));

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
    const dt = Math.min(delta, 0.05);

    // Hold-breath + deep silence → presence listens. Rise a touch slower than
    // fall so the freeze feels attentive, not gated; thaw resumes promptly.
    const stillnessTarget = Math.min(
      1,
      Math.max(m.holdBreath, m.silence * 0.92) + Math.min(m.holdBreath, m.silence) * 0.15,
    );
    stillnessSmooth.current = smoothToward(
      stillnessSmooth.current,
      stillnessTarget,
      dt,
      0.12,
      0.07,
    );
    const stillness = stillnessSmooth.current;
    // Drift nearly stops at full stillness; a whisper of motion remains so
    // the cloud never looks frozen-dead.
    const driftMul = 1 - stillness * 0.92;
    // Soft radial huddle toward spawn center while listening.
    const huddle = stillness * 1.35;

    // Update wisp positions (gentle Perlin-style drift + stillness huddle).
    const points = pointsRef.current;
    const mat = matRef.current;
    if (points && mat) {
      const posAttr = points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      for (let i = 0; i < wispCount; i++) {
        const fx = seeds[i * 4]!;
        const fy = seeds[i * 4 + 1]!;
        const fz = seeds[i * 4 + 2]!;
        const i3 = i * 3;
        let x = arr[i3] ?? 0;
        let y = arr[i3 + 1] ?? 0;
        let z = arr[i3 + 2] ?? 0;

        // Drift along a wandering path. Bass slightly amplifies vertical motion
        // so the cloud "swells" subtly with the kick. Stillness scales the
        // wander so flock gather/burst (when present) still owns the radial axis.
        x += Math.sin(now * fx + i * 0.13) * dt * 0.08 * driftMul;
        y += Math.cos(now * fy + i * 0.17) * dt * 0.06 * (1 + m.bass * 0.4) * driftMul;
        z += Math.sin(now * fz + i * 0.21) * dt * 0.04 * driftMul;

        // Huddle: gentle pull toward center — attentive, not a collapse.
        if (huddle > 0.01) {
          const dx = x - HUDDLE_CX;
          const dy = y - HUDDLE_CY;
          const dz = z - HUDDLE_CZ;
          const r = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-4;
          // Per-wisp phase so the cloud coheres without locking into a sphere.
          const phase = 0.75 + 0.35 * Math.sin(seeds[i * 4 + 3]! * 2.1 + i * 0.07);
          const pull = huddle * phase * dt * Math.min(1, r * 0.35);
          const invR = 1 / r;
          x -= dx * invR * pull;
          y -= dy * invR * pull;
          z -= dz * invR * pull;
        }

        // Soft attractor back toward spawn region so wisps don't escape.
        const escapeR = Math.sqrt(x * x + y * y + z * z);
        if (escapeR > 6) {
          const pull = (escapeR - 6) * dt * 0.5;
          const eInv = 1 / escapeR;
          x -= x * eInv * pull;
          y -= y * eInv * pull;
          z -= z * eInv * pull;
        }

        arr[i3] = x;
        arr[i3 + 1] = y;
        arr[i3 + 2] = z;
      }
      posAttr.needsUpdate = true;
      // Wisp brightness pulses with high frequencies; stillness softens the pulse.
      const livePulse = 1 - stillness * 0.55;
      mat.size = (0.04 + m.high * 0.12 * livePulse) * (0.7 + amount * 0.3);
      mat.opacity = (0.25 + (m.high * 0.5 + m.flow * 0.15) * livePulse) * amount;
    }

    // Soul glow breathes with energy + a slow autonomous pulse (the heartbeat
    // is also handled in SceneRig as camera breath; here it just keeps glow alive).
    const glowMat = glowMatRef.current;
    if (glowMat) {
      const autoBreath = 0.18 + 0.06 * Math.sin(now * 0.4) * (1 - stillness * 0.7);
      // Tenderness expands the glow softly; silence quiets it; drops punch through.
      const tenderExpand = 1 + m.tenderness * 0.7;
      const silenceMute = 1 - m.silence * 0.6;
      glowMat.uniforms.uIntensity!.value =
        (autoBreath + m.bass * 0.5 + m.beat * 0.3 + m.release * 0.5) *
        amount *
        silenceMute *
        tenderExpand;
      // Warm vs cool target color depends on moodValence and tenderness.
      const warmth = 0.5 + m.moodValence * 0.35 + m.tenderness * 0.2;
      bassColor.current.set(palette.bass);
      midColor.current.set(palette.mid);
      (glowMat.uniforms.uColor!.value as THREE.Color).lerpColors(
        bassColor.current,
        midColor.current,
        Math.max(0, Math.min(1, warmth)),
      );
      // Halo tightens slightly while listening.
      glowMat.uniforms.uRadius!.value = 1 - stillness * 0.1;
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
