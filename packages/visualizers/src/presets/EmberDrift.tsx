'use client';

/**
 * Ember Drift — rising warm ashfield between Particle Storm chaos and
 * Star Field dust. Musical anatomy:
 *  - swell → embers lift faster / brighter through choruses
 *  - gather → inhale toward the vertical center before the beat
 *  - impact → soft flare (size + warmth), not a strobe
 *  - hat → sparse tick sparkles on selected embers
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';
import { getDotTexture } from '../dotTexture';

const COUNT_HIGH = 4800;
const COUNT_MID = 2200;
const COUNT_LOW = 900;

const Y_MIN = -2.8;
const Y_MAX = 2.9;
const Y_SPAN = Y_MAX - Y_MIN;

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

function hash01(n: number) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export function EmberDriftScene({ analyser, palette, tier, speed = 1 }: VisualizerSceneProps) {
  const mods = useModulation();
  const ref = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();
  const baseCount = tier === 'high' ? COUNT_HIGH : tier === 'mid' ? COUNT_MID : COUNT_LOW;
  const kitAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;

  const scratchBass = useRef(new THREE.Color());
  const scratchMid = useRef(new THREE.Color());
  const scratchHigh = useRef(new THREE.Color());
  const scratchWarm = useRef(new THREE.Color(1, 0.55, 0.22));
  const scratchMix = useRef(new THREE.Color());

  const gatherSmooth = useRef(0);
  const impactSmooth = useRef(0);
  const hatSmooth = useRef(0);
  const swellSmooth = useRef(0.15);
  const afterglowSmooth = useRef(0);
  const timeRef = useRef(0);

  const sprite = useMemo(() => getDotTexture(), []);

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const { positions, velocities, phases, bands, sizes } = useMemo(() => {
    const p = new Float32Array(baseCount * 3);
    const v = new Float32Array(baseCount * 3);
    const ph = new Float32Array(baseCount);
    const b = new Uint8Array(baseCount);
    const sz = new Float32Array(baseCount);
    for (let i = 0; i < baseCount; i++) {
      const seed = i * 1.6180339887;
      const r = Math.sqrt(hash01(seed + 0.11)) * 2.35;
      const ang = hash01(seed + 0.37) * Math.PI * 2;
      p[i * 3] = Math.cos(ang) * r;
      p[i * 3 + 1] = Y_MIN + hash01(seed + 0.71) * Y_SPAN;
      p[i * 3 + 2] = Math.sin(ang) * r * 0.85;
      // Soft lateral drift + base rise — never the storm's thrash.
      v[i * 3] = (hash01(seed + 1.1) - 0.5) * 0.012;
      v[i * 3 + 1] = 0.35 + hash01(seed + 1.4) * 0.55;
      v[i * 3 + 2] = (hash01(seed + 1.7) - 0.5) * 0.012;
      ph[i] = hash01(seed + 2.3);
      b[i] = i % 3;
      sz[i] = 0.55 + hash01(seed + 2.9) * 0.9;
    }
    return { positions: p, velocities: v, phases: ph, bands: b, sizes: sz };
  }, [baseCount]);

  const colors = useMemo(() => {
    const c = new Float32Array(baseCount * 3);
    const bass = new THREE.Color(palette.bass);
    const mid = new THREE.Color(palette.mid);
    const high = new THREE.Color(palette.high);
    const warm = new THREE.Color(1, 0.55, 0.22);
    for (let i = 0; i < baseCount; i++) {
      const band = bands[i]!;
      const base = band === 0 ? bass : band === 1 ? mid : high;
      const ember = base.clone().lerp(warm, 0.45 + (phases[i] ?? 0) * 0.25);
      c[i * 3] = ember.r;
      c[i * 3 + 1] = ember.g;
      c[i * 3 + 2] = ember.b;
    }
    return c;
  }, [baseCount, palette, bands, phases]);

  useFrame((_state, delta) => {
    const points = ref.current;
    const mat = matRef.current;
    if (!points || !mat) return;

    const m = metricsRef.current;
    const dt = Math.min(delta, 0.05);
    const pace = Math.max(0.05, mods.current.speed ?? speed);
    const calm = reducedMotion ? 0.4 : 1;
    const sectionPace = 0.78 + m.sectionLevel * 0.4;

    timeRef.current += dt * pace * sectionPace * calm;

    gatherSmooth.current = smoothToward(gatherSmooth.current, m.gather, dt, 0.04, 0.14);
    swellSmooth.current = smoothToward(swellSmooth.current, m.swell, dt, 0.12, 0.45);
    impactSmooth.current = smoothToward(
      impactSmooth.current,
      Math.min(1.2, m.impact * 0.95 + m.release * 0.18) * kitAmp,
      dt,
      0.03,
      0.16,
    );
    hatSmooth.current = smoothToward(
      hatSmooth.current,
      Math.min(1.2, m.hat * 0.95 + m.shimmer * 0.22) * kitAmp,
      dt,
      0.025,
      0.1,
    );
    afterglowSmooth.current = smoothToward(afterglowSmooth.current, m.afterglow, dt, 0.18, 0.8);

    const gather = gatherSmooth.current;
    const impact = impactSmooth.current;
    const hat = hatSmooth.current;
    const swell = swellSmooth.current;
    const afterglow = afterglowSmooth.current;

    // Lift on swell: choruses loft the ashfield; gather slows the rise.
    const lift =
      dt *
      pace *
      sectionPace *
      calm *
      (0.55 + swell * 1.15 + m.energy * 0.35 + m.bass * 0.2) *
      (1 - gather * 0.72);

    const flare = 1 + impact * 0.85 + afterglow * 0.2;
    mat.size = (0.048 + swell * 0.028 + impact * 0.04) * (0.92 + kitAmp * 0.08);
    mat.opacity = Math.min(1, 0.58 + swell * 0.28 + impact * 0.18 + afterglow * 0.12);

    const posAttr = points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const colorAttr = points.geometry.getAttribute('color') as THREE.BufferAttribute;
    const colArr = colorAttr.array as Float32Array;

    const bassC = scratchBass.current.set(palette.bass);
    const midC = scratchMid.current.set(palette.mid);
    const highC = scratchHigh.current.set(palette.high);
    const warmC = scratchWarm.current.setRGB(1, 0.55, 0.22);
    const mixC = scratchMix.current;
    const t = timeRef.current;

    // Inhale toward center on gather — stronger on outer embers.
    const gatherPull = 1 - gather * dt * 2.1;

    for (let i = 0; i < baseCount; i++) {
      const i3 = i * 3;
      const phase = phases[i]!;
      const band = bands[i]!;
      const sizeMul = sizes[i]!;

      let x = arr[i3] ?? 0;
      let y = arr[i3 + 1] ?? 0;
      let z = arr[i3 + 2] ?? 0;

      const wobble = Math.sin(t * (1.1 + phase * 1.8) + phase * 12.0) * (0.01 + m.mid * 0.012);
      const driftX = (velocities[i3] ?? 0) + wobble;
      const driftZ = (velocities[i3 + 2] ?? 0) + Math.cos(t * (0.9 + phase) + phase * 7.0) * 0.008;
      const rise = (velocities[i3 + 1] ?? 0.5) * (0.85 + sizeMul * 0.25);

      x += driftX * lift * 18;
      y += rise * lift;
      z += driftZ * lift * 18;

      // Soft radial inhale — ash folds toward the column, not a hard snap.
      x *= gatherPull;
      z *= gatherPull;
      // Vertical inhale: settle slightly toward mid-frame before the beat.
      y += (0 - y) * gather * dt * 1.05;

      // Recycle off the top (or if yanked too far) back to the hearth below.
      if (y > Y_MAX || Math.hypot(x, z) > 3.6) {
        const seed = i * 1.6180339887 + t * 0.01;
        const r = Math.sqrt(hash01(seed + 0.11)) * 2.2;
        const ang = hash01(seed + 0.37) * Math.PI * 2;
        x = Math.cos(ang) * r;
        y = Y_MIN - hash01(seed + 0.71) * 0.35;
        z = Math.sin(ang) * r * 0.85;
      }

      arr[i3] = x;
      arr[i3 + 1] = y;
      arr[i3 + 2] = z;

      const baseCol = band === 0 ? bassC : band === 1 ? midC : highC;
      const warmth = 0.42 + phase * 0.28 + afterglow * 0.35 + impact * 0.2;
      mixC.copy(baseCol).lerp(warmC, Math.min(0.85, warmth));

      // Height gradient: cooler near the hearth, hotter as they rise.
      const heightGlow = 0.75 + ((y - Y_MIN) / Y_SPAN) * 0.45;
      // Sparse hat ticks — only ~1/3 of embers sparkle so it reads as ticks.
      const tickSelect = hash01(phase * 17.13 + i * 0.31) > 0.62 ? 1 : 0;
      const sparkle = 1 + tickSelect * hat * (1.1 + m.shimmer * 0.4);
      const gain = heightGlow * flare * sparkle * (0.85 + swell * 0.25);

      colArr[i3] = Math.min(1, mixC.r * gain);
      colArr[i3 + 1] = Math.min(1, mixC.g * gain);
      colArr[i3 + 2] = Math.min(1, mixC.b * gain);
    }

    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;

    // Very slow column sway — alive, never storm-spin.
    points.rotation.y += dt * pace * calm * (0.04 + m.mid * 0.03 + swell * 0.02);

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={baseCount} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} count={baseCount} />
      </bufferGeometry>
      <pointsMaterial
        ref={matRef}
        size={0.055}
        map={sprite}
        sizeAttenuation
        transparent
        vertexColors
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
