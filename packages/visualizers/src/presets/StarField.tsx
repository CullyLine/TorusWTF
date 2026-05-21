'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';

const ARMS = 3;

export function StarFieldScene({ analyser, palette, tier }: VisualizerSceneProps) {
  const ref = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();
  const twinkleRef = useRef(new Float32Array(0));

  const count = tier === 'high' ? 14_000 : tier === 'mid' ? 6_000 : 2_000;

  const { positions, baseR, baseA, armIndex } = useMemo(() => {
    const p = new Float32Array(count * 3);
    const r = new Float32Array(count);
    const a = new Float32Array(count);
    const arm = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      const armI = i % ARMS;
      const t = Math.random();
      const radius = 0.3 + Math.pow(t, 1.6) * 4.5;
      const angle = armI * ((Math.PI * 2) / ARMS) + radius * 0.85 + (Math.random() - 0.5) * 0.35;
      p[i * 3] = Math.cos(angle) * radius;
      p[i * 3 + 1] = (Math.random() - 0.5) * 0.35;
      p[i * 3 + 2] = Math.sin(angle) * radius;
      r[i] = radius;
      a[i] = angle;
      arm[i] = armI;
    }
    return { positions: p, baseR: r, baseA: a, armIndex: arm };
  }, [count]);

  const colors = useMemo(() => {
    const c = new Float32Array(count * 3);
    const bass = new THREE.Color(palette.bass);
    const mid = new THREE.Color(palette.mid);
    const high = new THREE.Color(palette.high);
    for (let i = 0; i < count; i++) {
      const pick = armIndex[i]! % 3;
      const color = pick === 0 ? bass : pick === 1 ? mid : high;
      c[i * 3] = color.r;
      c[i * 3 + 1] = color.g;
      c[i * 3 + 2] = color.b;
    }
    return c;
  }, [count, palette, armIndex]);

  useFrame((_state, delta) => {
    const points = ref.current;
    const mat = matRef.current;
    if (!points || !mat) return;
    if (twinkleRef.current.length !== count) {
      twinkleRef.current = new Float32Array(count);
    }

    const m = metricsRef.current;
    const tighten = 1 - m.bass * 0.18;
    const spin = delta * (0.04 + m.mid * 0.12);

    mat.size = 0.018 + m.energy * 0.04;
    mat.opacity = 0.4 + m.energy * 0.55;

    const posAttr = points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = points.geometry.getAttribute('color') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const cols = colAttr.array as Float32Array;
    const tw = twinkleRef.current;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const radius = baseR[i]! * tighten;
      const angle = baseA[i]! + spin * (1 + armIndex[i]! * 0.08);
      arr[i3] = Math.cos(angle) * radius;
      arr[i3 + 1] = (arr[i3 + 1] ?? 0) * 0.98;
      arr[i3 + 2] = Math.sin(angle) * radius;

      tw[i] = Math.max(0, (tw[i] ?? 0) - delta * 3);
      if (m.high > 0.6 && Math.random() < 0.002 * (1 + m.high)) {
        tw[i] = 1;
      }
      const boost = 1 + (tw[i] ?? 0) * 0.8;
      cols[i3] = Math.min(1, cols[i3]! * boost);
      cols[i3 + 1] = Math.min(1, cols[i3 + 1]! * boost);
      cols[i3 + 2] = Math.min(1, cols[i3 + 2]! * boost);
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    points.rotation.y += spin * 0.5;

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={count} itemSize={3} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} count={count} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        ref={matRef}
        size={0.025}
        sizeAttenuation
        transparent
        opacity={0.75}
        vertexColors
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
