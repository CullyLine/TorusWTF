'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import {
  DEFAULT_FLOW_PARAMS,
  flowParamsFromMetrics,
  sampleFlow,
  type FlowParams,
  type Vec3Like,
} from '../dsp/flowfield';

export function ParticleStormScene({ analyser, palette, tier }: VisualizerSceneProps) {
  const ref = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();
  const baseCount = tier === 'high' ? 8000 : tier === 'mid' ? 3500 : 1200;
  // Flow Field Update: the storm rides the shared curl current.
  const flowParamsRef = useRef<FlowParams>({ ...DEFAULT_FLOW_PARAMS });
  const flowTimeRef = useRef(0);
  const flowScratch = useRef<Vec3Like>({ x: 0, y: 0, z: 0 });

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
    const speed = delta * (0.15 + m.energy * 2.8 + m.beat * 3.5);
    const pulse = 1 + m.bass * 0.9 + m.beat * 0.6;
    const activeRatio = 0.25 + m.flow * 0.75;

    // Shared flow current — same math as the Flow Field flagship.
    const dtClamped = Math.min(delta, 0.05);
    flowTimeRef.current += dtClamped * (0.5 + Math.min(m.energy, 1.5) * 0.4);
    const fp = flowParamsFromMetrics(m, flowParamsRef.current);
    fp.time = flowTimeRef.current;
    const flowAmount = dtClamped * (0.45 + m.energy * 0.6 + m.dropEvent * 1.2);
    const fv = flowScratch.current;

    mat.size = 0.025 + m.energy * 0.06 + m.beat * 0.04;
    mat.opacity = 0.35 + m.flow * 0.55;

    const posAttr = points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const colorAttr = points.geometry.getAttribute('color') as THREE.BufferAttribute;
    const colArr = colorAttr.array as Float32Array;

    for (let i = 0; i < baseCount; i++) {
      const i3 = i * 3;
      const alive = phases[i]! < activeRatio;
      if (!alive) {
        colArr[i3]! *= 0.92;
        colArr[i3 + 1]! *= 0.92;
        colArr[i3 + 2]! *= 0.92;
        continue;
      }

      let x = (arr[i3] ?? 0) + (velocities[i3] ?? 0) * pulse * speed * 40;
      let y = (arr[i3 + 1] ?? 0) + (velocities[i3 + 1] ?? 0) * pulse * speed * 40;
      let z = (arr[i3 + 2] ?? 0) + (velocities[i3 + 2] ?? 0) * pulse * speed * 40;
      // Advect through the band's current. Each band rides its own field
      // until convergence merges them into one collective stream.
      sampleFlow(fv, x, y, z, bands[i]!, fp);
      x += fv.x * flowAmount;
      y += fv.y * flowAmount;
      z += fv.z * flowAmount;
      const dist = Math.hypot(x, y, z);
      if (dist > 5 + m.breath * 2) {
        x *= 0.45;
        y *= 0.45;
        z *= 0.45;
      }
      arr[i3] = x;
      arr[i3 + 1] = y;
      arr[i3 + 2] = z;

      colArr[i3] = Math.min(1, colArr[i3]! * (1 + m.beat * 0.15));
      colArr[i3 + 1] = Math.min(1, colArr[i3 + 1]! * (1 + m.mid * 0.1));
      colArr[i3 + 2] = Math.min(1, colArr[i3 + 2]! * (1 + m.high * 0.12));
    }
    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    points.rotation.y += speed * (0.5 + m.mid);
    points.rotation.x += m.beat * 0.08;

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
        size={0.04}
        sizeAttenuation
        transparent
        vertexColors
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
