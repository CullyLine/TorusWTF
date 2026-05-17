'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';

/**
 * **Volumetric Waveform** — the live time-domain waveform extruded into 3D,
 * slowly rotating with dust motes. The most minimal of the four. Genre-agnostic.
 */
export function VolumetricWaveformScene({ analyser, palette, tier }: VisualizerSceneProps) {
  const groupRef = useRef<THREE.Group>(null);
  const lineRef = useRef<THREE.LineSegments>(null);
  const timeBuf = useRef<Uint8Array>(new Uint8Array(1024));

  const samples = tier === 'high' ? 512 : tier === 'mid' ? 256 : 128;

  const positions = useMemo(() => new Float32Array(samples * 2 * 3), [samples]);
  const colors = useMemo(() => {
    const c = new Float32Array(samples * 2 * 3);
    const mid = new THREE.Color(palette.mid);
    for (let i = 0; i < samples * 2; i++) {
      c[i * 3] = mid.r;
      c[i * 3 + 1] = mid.g;
      c[i * 3 + 2] = mid.b;
    }
    return c;
  }, [samples, palette]);

  useFrame((_state, delta) => {
    const line = lineRef.current;
    const group = groupRef.current;
    if (!line || !group) return;
    group.rotation.y += delta * 0.15;

    if (analyser) {
      const bins = analyser.getTimeDomainData(timeBuf.current);
      if (bins > 0) {
        const arr = line.geometry.getAttribute('position').array as Float32Array;
        for (let i = 0; i < samples; i++) {
          const src = Math.floor((i / samples) * bins);
          const v = (timeBuf.current[src]! / 128 - 1) * 1.2;
          const x = (i / samples) * 6 - 3;
          const baseIdx = i * 6;
          arr[baseIdx] = x;
          arr[baseIdx + 1] = v;
          arr[baseIdx + 2] = 0;
          arr[baseIdx + 3] = x;
          arr[baseIdx + 4] = -v;
          arr[baseIdx + 5] = 0;
        }
        (line.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      }
    }
  });

  return (
    <group ref={groupRef}>
      <lineSegments ref={lineRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
            count={samples * 2}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[colors, 3]}
            count={samples * 2}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={0.9}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>
    </group>
  );
}
