'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';

export function LiquidChromeScene({ analyser, palette, tier }: VisualizerSceneProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();
  const basePos = useRef<Float32Array | null>(null);

  const subdiv = tier === 'high' ? 128 : tier === 'mid' ? 64 : 32;

  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1.1, subdiv), [subdiv]);

  useMemo(() => {
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    basePos.current = new Float32Array(pos.array);
  }, [geometry]);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh || !basePos.current) return;
    const m = metricsRef.current;
    const posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const base = basePos.current;
    const t = state.clock.elapsedTime;
    const disp = 0.12 + m.bass * 0.35 + m.beat * 0.25;

    for (let i = 0; i < arr.length; i += 3) {
      const bx = base[i]!;
      const by = base[i + 1]!;
      const bz = base[i + 2]!;
      const n =
        Math.sin(bx * 2.1 + t * 1.3) *
          Math.cos(by * 1.7 + t) *
          Math.sin(bz * 2.4 + t * 0.9) +
        Math.sin((bx + by) * 3 + t * 2) * 0.5;
      const len = Math.hypot(bx, by, bz) || 1;
      const scale = 1 + n * disp;
      arr[i] = (bx / len) * len * scale;
      arr[i + 1] = (by / len) * len * scale;
      arr[i + 2] = (bz / len) * len * scale;
    }
    posAttr.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.rotation.y += delta * (0.15 + m.mid * 0.4);
    mesh.rotation.x = Math.sin(t * 0.35) * 0.12 + m.high * 0.08;

    const mat = mesh.material;
    if (mat && !Array.isArray(mat) && 'emissiveIntensity' in mat) {
      (mat as THREE.MeshStandardMaterial).emissiveIntensity = 0.2 + m.energy * 0.5 + m.beat * 0.35;
    }

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial
        color={palette.mid}
        emissive={palette.high}
        metalness={1}
        roughness={0.15}
        emissiveIntensity={0.25}
      />
    </mesh>
  );
}
