'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';
import {
  DEFAULT_FLOW_PARAMS,
  flowParamsFromMetrics,
  sampleFlow,
  type FlowParams,
  type Vec3Like,
} from '../dsp/flowfield';
import { getDotTexture } from '../dotTexture';

export function ParticleStormScene({ analyser, palette, tier, speed = 1 }: VisualizerSceneProps) {
  const mods = useModulation();
  const ref = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();
  const baseCount = tier === 'high' ? 8000 : tier === 'mid' ? 3500 : 1200;
  // Flow Field Update: the storm rides the shared curl current.
  const flowParamsRef = useRef<FlowParams>({ ...DEFAULT_FLOW_PARAMS });
  const flowTimeRef = useRef(0);
  const flowScratch = useRef<Vec3Like>({ x: 0, y: 0, z: 0 });
  const scratchBass = useRef(new THREE.Color());
  const scratchMid = useRef(new THREE.Color());
  const scratchHigh = useRef(new THREE.Color());
  const sprite = useMemo(() => getDotTexture(), []);

  const { positions, velocities, phases, bands } = useMemo(() => {
    const p = new Float32Array(baseCount * 3);
    const v = new Float32Array(baseCount * 3);
    const ph = new Float32Array(baseCount);
    const b = new Uint8Array(baseCount);
    for (let i = 0; i < baseCount; i++) {
      p[i * 3] = (Math.random() - 0.5) * 6;
      p[i * 3 + 1] = (Math.random() - 0.5) * 6;
      p[i * 3 + 2] = (Math.random() - 0.5) * 6;
      v[i * 3] = (Math.random() - 0.5) * 0.02;
      v[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
      v[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
      ph[i] = Math.random();
      b[i] = i % 3;
    }
    return { positions: p, velocities: v, phases: ph, bands: b };
  }, [baseCount]);

  const colors = useMemo(() => {
    const c = new Float32Array(baseCount * 3);
    const bass = new THREE.Color(palette.bass);
    const mid = new THREE.Color(palette.mid);
    const high = new THREE.Color(palette.high);
    for (let i = 0; i < baseCount; i++) {
      // Color follows the particle's flow band so converging currents read
      // as converging colors.
      const color = bands[i] === 0 ? bass : bands[i] === 1 ? mid : high;
      c[i * 3] = color.r;
      c[i * 3 + 1] = color.g;
      c[i * 3 + 2] = color.b;
    }
    return c;
  }, [baseCount, palette, bands]);

  useFrame((_state, delta) => {
    const points = ref.current;
    const mat = matRef.current;
    if (!points || !mat) return;

    const m = metricsRef.current;
    const spd = mods.current.speed ?? speed;
    // The storm's rage follows the song's arc: valleys drift, peaks tear.
    // Live drums whip the wind beyond what raw band energy reports.
    const sectionPace = 0.7 + m.sectionLevel * 0.5;
    const drive =
      delta * spd * (0.15 + m.energy * 2.4 + m.impact * 3 + m.drumActivity * 0.8) * sectionPace;
    const pulse = 1 + m.bass * 0.8 + m.impact * 0.55;
    const activeRatio = 0.35 + m.flow * 0.65;

    // Shared flow current — same math as the Flow Field flagship.
    const dtClamped = Math.min(delta, 0.05);
    flowTimeRef.current += dtClamped * spd * (0.5 + Math.min(m.energy, 1.5) * 0.4);
    const fp = flowParamsFromMetrics(m, flowParamsRef.current);
    fp.time = flowTimeRef.current;
    const flowAmount = dtClamped * (0.45 + m.swell * 0.7 + m.dropEvent * 1.2);
    // Pre-beat gather: the swarm contracts toward center in the breath
    // before each predicted beat, then the hit flings it back out.
    const gatherPull = 1 - m.gather * dtClamped * 1.6;
    const fv = flowScratch.current;

    mat.size = 0.045 + m.swell * 0.05 + m.impact * 0.04;
    // Afterglow keeps the swarm faintly incandescent after big moments.
    mat.opacity = Math.min(1, 0.55 + m.swell * 0.4 + m.afterglow * 0.15);

    const posAttr = points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const colorAttr = points.geometry.getAttribute('color') as THREE.BufferAttribute;
    const colArr = colorAttr.array as Float32Array;

    // Live palette: bands re-tint every frame so color life and palette
    // swaps reach every particle (the mount-time buffer would stay frozen).
    const bassC = scratchBass.current.set(palette.bass);
    const midC = scratchMid.current.set(palette.mid);
    const highC = scratchHigh.current.set(palette.high);
    const bassGain = 1 + m.impact * 0.35;
    const midGain = 1 + m.mid * 0.25;
    const highGain = 1 + m.shimmer * 0.45;

    for (let i = 0; i < baseCount; i++) {
      const i3 = i * 3;
      const alive = phases[i]! < activeRatio;
      const band = bands[i]!;
      const color = band === 0 ? bassC : band === 1 ? midC : highC;
      const gain = (alive ? 1 : 0.3) * (band === 0 ? bassGain : band === 1 ? midGain : highGain);
      colArr[i3] = Math.min(1, color.r * gain);
      colArr[i3 + 1] = Math.min(1, color.g * gain);
      colArr[i3 + 2] = Math.min(1, color.b * gain);
      if (!alive) continue;

      let x = (arr[i3] ?? 0) + (velocities[i3] ?? 0) * pulse * drive * 40;
      let y = (arr[i3 + 1] ?? 0) + (velocities[i3 + 1] ?? 0) * pulse * drive * 40;
      let z = (arr[i3 + 2] ?? 0) + (velocities[i3 + 2] ?? 0) * pulse * drive * 40;
      // Advect through the band's current. Each band rides its own field
      // until convergence merges them into one collective stream.
      sampleFlow(fv, x, y, z, band, fp);
      x = (x + fv.x * flowAmount) * gatherPull;
      y = (y + fv.y * flowAmount) * gatherPull;
      z = (z + fv.z * flowAmount) * gatherPull;
      const dist = Math.hypot(x, y, z);
      if (dist > 5 + m.breath * 2) {
        x *= 0.45;
        y *= 0.45;
        z *= 0.45;
      }
      arr[i3] = x;
      arr[i3 + 1] = y;
      arr[i3 + 2] = z;
    }
    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    points.rotation.y += drive * (0.5 + m.mid);
    points.rotation.x += m.impact * 0.05 + m.dropEvent * 0.02;

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
