'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';

/**
 * **Particle Storm** — GPU-instanced particles whose positions are perturbed
 * by frequency-band energy. High-energy material (riddim, dubstep, DnB) feels
 * physically present.
 */
export function ParticleStormScene({ analyser, palette, tier }: VisualizerSceneProps) {
  const ref = useRef<THREE.Points>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const count = tier === 'high' ? 8000 : tier === 'mid' ? 3500 : 1200;

  const { positions, velocities } = useMemo(() => {
    const p = new Float32Array(count * 3);
    const v = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      p[i * 3] = (Math.random() - 0.5) * 6;
      p[i * 3 + 1] = (Math.random() - 0.5) * 6;
      p[i * 3 + 2] = (Math.random() - 0.5) * 6;
      v[i * 3] = (Math.random() - 0.5) * 0.02;
      v[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
      v[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
    }
    return { positions: p, velocities: v };
  }, [count]);

  const colors = useMemo(() => {
    const c = new Float32Array(count * 3);
    const bass = new THREE.Color(palette.bass);
    const mid = new THREE.Color(palette.mid);
    const high = new THREE.Color(palette.high);
    for (let i = 0; i < count; i++) {
      const choice = Math.random();
      const color = choice < 0.33 ? bass : choice < 0.66 ? mid : high;
      c[i * 3] = color.r;
      c[i * 3 + 1] = color.g;
      c[i * 3 + 2] = color.b;
    }
    return c;
  }, [count, palette]);

  useFrame((_state, delta) => {
    const points = ref.current;
    if (!points) return;

    let bass = 0.2;
    let highs = 0.2;
    if (analyser) {
      const bins = analyser.getFrequencyData(freqBuf.current);
      if (bins > 0) {
        const split = Math.floor(bins * 0.1);
        bass = avg(freqBuf.current, 0, split) / 255;
        highs = avg(freqBuf.current, Math.floor(bins * 0.4), bins) / 255;
      }
    }

    const posAttr = points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const pulse = 1 + bass * 0.6;
    const swirl = delta * (0.2 + highs * 1.5);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      let x = (arr[i3] ?? 0) + (velocities[i3] ?? 0) * pulse;
      let y = (arr[i3 + 1] ?? 0) + (velocities[i3 + 1] ?? 0) * pulse;
      let z = (arr[i3 + 2] ?? 0) + (velocities[i3 + 2] ?? 0) * pulse;
      // Soft sphere boundary — pull stragglers back in
      const dist = Math.hypot(x, y, z);
      if (dist > 6) {
        x *= 0.5;
        y *= 0.5;
        z *= 0.5;
      }
      arr[i3] = x;
      arr[i3 + 1] = y;
      arr[i3 + 2] = z;
    }
    posAttr.needsUpdate = true;
    points.rotation.y += swirl;
  });

  return (
    <>
      <points ref={ref}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
            count={count}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[colors, 3]}
            count={count}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.04}
          sizeAttenuation
          transparent
          vertexColors
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </>
  );
}

function avg(buf: Uint8Array, start: number, end: number): number {
  let total = 0;
  for (let i = start; i < end; i++) total += buf[i]!;
  return total / Math.max(1, end - start);
}
