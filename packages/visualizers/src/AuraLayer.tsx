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
 * Musical flock (call-and-response):
 *  - gather → wisps drift inward (the inhale before the kick)
 *  - impact / release → burst outward
 *  - shimmer / hat → glitter ticks on size + opacity
 *  - leanIn → mild approach toward camera/center (anticipation, pre-drop)
 *
 * Stillness (holdBreath / deep silence):
 *  - Perlin drift nearly freezes
 *  - soft huddle toward the spawn center
 *  - thaw resumes promptly when music returns
 *
 * Both exist regardless of audio source. With music they brighten and
 * flock; in silence they listen, then keep drifting like dust in a beam.
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

/** Spawn-region center — flock inhale/burst radiates from here. */
const FLOCK_CX = 0;
const FLOCK_CY = 0;
const FLOCK_CZ = -1.5;

function createAuraRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

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

  // Smoothed musical envelopes so flock motion feels fluid, not gated.
  const gatherSmooth = useRef(0);
  const burstSmooth = useRef(0);
  const glitterSmooth = useRef(0);
  // Smoothed lean-in so anticipation eases toward the viewer, not snaps.
  const leanSmooth = useRef(0);
  // Smoothed stillness so freeze/thaw never pops.
  const stillnessSmooth = useRef(0);

  // Reused color temps — avoid per-frame Color allocations in the glow lerp.
  const bassColor = useRef(new THREE.Color(palette.bass));
  const midColor = useRef(new THREE.Color(palette.mid));

  const wispCount =
    tier === 'high' ? WISP_COUNT_HIGH : tier === 'mid' ? WISP_COUNT_MID : WISP_COUNT_LOW;

  // Per-wisp seeds for stable trajectory + per-wisp brightness phase offset.
  const { positions, seeds, colors } = useMemo(() => {
    const pos = new Float32Array(wispCount * 3);
    const seed = new Float32Array(wispCount * 4);
    const col = new Float32Array(wispCount * 3);
    const bass = new THREE.Color(palette.bass);
    const mid = new THREE.Color(palette.mid);
    const high = new THREE.Color(palette.high);
    const random = createAuraRng(0xa17a5eed ^ wispCount);
    for (let i = 0; i < wispCount; i++) {
      // Spawn in a sphere around the camera-facing region.
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      const r = 2 + random() * 3;
      pos[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      pos[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * r;
      pos[i * 3 + 2] = Math.cos(phi) * r - 1.5;
      // Per-wisp trajectory seeds (sin frequencies for x/y/z + brightness phase).
      seed[i * 4] = 0.05 + random() * 0.12;
      seed[i * 4 + 1] = 0.05 + random() * 0.12;
      seed[i * 4 + 2] = 0.05 + random() * 0.12;
      seed[i * 4 + 3] = random() * Math.PI * 2;
      // Color: a tertiary mix biased toward mid (rare bass/high wisps).
      const pick = random();
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

  useFrame((state, delta) => {
    if (amount <= 0) return;
    const m = metricsRef.current;
    const now = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);

    // Fast rise on hits / gather so the inhale lands; slower fall so the
    // flock eases rather than pops back to idle wander.
    gatherSmooth.current = smoothToward(gatherSmooth.current, m.gather, dt, 0.04, 0.16);
    const burstTarget = Math.min(1.4, m.impact * 0.9 + m.release * 0.55);
    burstSmooth.current = smoothToward(burstSmooth.current, burstTarget, dt, 0.03, 0.14);
    const glitterTarget = Math.min(1.3, m.hat * 0.95 + m.shimmer * 0.55);
    glitterSmooth.current = smoothToward(glitterSmooth.current, glitterTarget, dt, 0.025, 0.11);
    // Lean-in rises with tension (eager anticipation); settles slower so the
    // approach lingers into the drop rather than snapping back.
    leanSmooth.current = smoothToward(leanSmooth.current, m.leanIn, dt, 0.06, 0.18);

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

    const gather = gatherSmooth.current;
    const burst = burstSmooth.current;
    const glitter = glitterSmooth.current;
    const lean = leanSmooth.current;
    const stillness = stillnessSmooth.current;
    // Drift nearly stops at full stillness; a whisper remains so the cloud
    // never looks frozen-dead. Flock gather/burst still owns the radial axis.
    const driftMul = 1 - stillness * 0.92;
    const huddle = stillness * 1.35;
    // Lean approach keeps moving through hush — anticipation ≠ listening freeze.
    // Soften only a little so lean still reads under partial stillness.
    const leanMul = 1 - stillness * 0.35;

    // Update wisp positions (gentle Perlin-style drift + musical flock + stillness).
    const points = pointsRef.current;
    const mat = matRef.current;
    if (points && mat) {
      const posAttr = points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      // Radial flock speed (units/sec). Gather pulls harder than burst so
      // the inhale reads clearly; burst rides impact without exploding.
      // Lean-in is a milder approach (~0.9 vs gather 2.4) so pre-drop
      // anticipation never masquerades as the gather inhale.
      const flockIn = gather * 2.4 + lean * 0.9 * leanMul;
      const flockOut = burst * 3.2;
      // Soften idle wander during the inhale so the cloud coheres; stillness
      // scales the leftover wander further. Lean trims wander lightly so the
      // cloud coheres toward the viewer without freezing like holdBreath.
      const wanderScale = (1 - gather * 0.55 - lean * 0.22 * leanMul) * driftMul;
      // Camera is +Z-facing; lean drifts wisps toward the viewer separately
      // from the radial gather inhale.
      const approachZ = lean * 0.85 * leanMul;
      for (let i = 0; i < wispCount; i++) {
        const fx = seeds[i * 4]!;
        const fy = seeds[i * 4 + 1]!;
        const fz = seeds[i * 4 + 2]!;
        const i3 = i * 3;
        let x = arr[i3] ?? 0;
        let y = arr[i3 + 1] ?? 0;
        let z = arr[i3 + 2] ?? 0;

        // Drift along a wandering path. Bass slightly amplifies vertical motion
        // so the cloud "swells" subtly with the kick.
        x += Math.sin(now * fx + i * 0.13) * dt * 0.08 * wanderScale;
        y += Math.cos(now * fy + i * 0.17) * dt * 0.06 * (1 + m.bass * 0.4) * wanderScale;
        z += Math.sin(now * fz + i * 0.21) * dt * 0.04 * wanderScale;

        // Flock: radial pull toward / push from the spawn-region center.
        const dx = x - FLOCK_CX;
        const dy = y - FLOCK_CY;
        const dz = z - FLOCK_CZ;
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-4;
        const invR = 1 / r;
        // Slight per-wisp phase so the flock isn't a perfect sphere collapse.
        const phase = 0.85 + 0.3 * Math.sin(seeds[i * 4 + 3]! + now * 1.7);
        const radial = (flockOut - flockIn) * phase * dt;
        x += dx * invR * radial;
        y += dy * invR * radial;
        z += dz * invR * radial;

        // Lean approach: bias toward the camera (+Z) with per-wisp phase so
        // anticipation feels like a flock leaning forward, not a Z snap.
        if (approachZ > 0.01) {
          const leanPhase = 0.8 + 0.4 * Math.sin(seeds[i * 4 + 3]! * 1.6 + i * 0.11);
          z += approachZ * leanPhase * dt;
        }

        // Huddle: gentle pull toward center while listening — attentive, not a collapse.
        // Unchanged by leanIn — listening freeze stays a different behavior.
        if (huddle > 0.01) {
          const huddlePhase = 0.75 + 0.35 * Math.sin(seeds[i * 4 + 3]! * 2.1 + i * 0.07);
          const pull = huddle * huddlePhase * dt * Math.min(1, r * 0.35);
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

      // Wisp brightness: high-band wash + sharp hat/shimmer glitter ticks.
      // Stillness softens the live pulse so listening feels quieter.
      // Lean slightly brightens — presence leans closer into the light.
      const livePulse = 1 - stillness * 0.55;
      const phaseTwinkle = glitter > 0.08 ? 0.5 + 0.5 * Math.sin(now * 28 + glitter * 9) : 0;
      mat.size =
        (0.04 +
          m.high * 0.1 * livePulse +
          glitter * 0.09 * (0.55 + phaseTwinkle * 0.9) +
          lean * 0.025 * leanMul) *
        (0.7 + amount * 0.3);
      mat.opacity = Math.min(
        1,
        (0.25 +
          (m.high * 0.4 + m.flow * 0.12) * livePulse +
          glitter * 0.45 +
          gather * 0.08 +
          lean * 0.06 * leanMul) *
          amount,
      );
    }

    // Soul glow breathes with energy + a slow autonomous pulse (the heartbeat
    // is also handled in SceneRig as camera breath; here it just keeps glow alive).
    const glowMat = glowMatRef.current;
    const glowMesh = glowRef.current;
    if (glowMat) {
      const autoBreath = 0.18 + 0.06 * Math.sin(now * 0.4) * (1 - stillness * 0.7);
      // Tenderness expands the glow softly; silence quiets it; drops punch through.
      const tenderExpand = 1 + m.tenderness * 0.7;
      const silenceMute = 1 - m.silence * 0.6;
      // Inhale dims slightly; burst + glitter lift intensity with the flock.
      // Lean adds a soft presence lift (anticipation), weaker than burst.
      glowMat.uniforms.uIntensity!.value =
        (autoBreath +
          m.bass * 0.5 +
          m.beat * 0.3 +
          m.release * 0.5 +
          burst * 0.22 +
          glitter * 0.18 +
          lean * 0.1 * leanMul -
          gather * 0.12) *
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
      // Soft radius inhale / release so the halo flocks with the wisps.
      // Stillness tucks the halo in slightly while listening.
      // Lean gently enlarges toward the viewer — presence approaches.
      glowMat.uniforms.uRadius!.value =
        1 - gather * 0.12 + burst * 0.08 - stillness * 0.1 + lean * 0.05 * leanMul;
      if (glowMesh) {
        const s = 1 - gather * 0.06 + burst * 0.05 - stillness * 0.04 + lean * 0.035 * leanMul;
        glowMesh.scale.setScalar(s);
      }
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
