'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry.js';

/**
 * **Torus Field** — the brand-signature visualizer.
 *
 * A luminous torus pulses with bass energy. Particles flow through the
 * inside, fan out around the top, descend the outside, and return —
 * the sacred-geometry torus-field energy flow, set in motion by sound.
 */
export function TorusFieldScene({ analyser, palette, tier }: VisualizerSceneProps) {
  const torusRef = useRef<THREE.Mesh>(null);
  const particlesRef = useRef<THREE.Points>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));

  const particleCount = tier === 'high' ? 6000 : tier === 'mid' ? 2500 : 800;

  const { positions, baseTheta, basePhi } = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    const t = new Float32Array(particleCount);
    const p = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 2;
      t[i] = theta;
      p[i] = phi;
      setTorusPoint(pos, i * 3, theta, phi, 1.4, 0.5);
    }
    return { positions: pos, baseTheta: t, basePhi: p };
  }, [particleCount]);

  const colorAttr = useMemo(() => {
    const c = new Float32Array(particleCount * 3);
    const bass = new THREE.Color(palette.bass);
    const mid = new THREE.Color(palette.mid);
    const high = new THREE.Color(palette.high);
    for (let i = 0; i < particleCount; i++) {
      const t = (basePhi[i]! / (Math.PI * 2)) % 1;
      let color: THREE.Color;
      if (t < 0.33) color = bass;
      else if (t < 0.66) color = mid;
      else color = high;
      c[i * 3] = color.r;
      c[i * 3 + 1] = color.g;
      c[i * 3 + 2] = color.b;
    }
    return c;
  }, [particleCount, basePhi, palette]);

  useFrame((_state, delta) => {
    const torus = torusRef.current;
    const points = particlesRef.current;
    if (!torus || !points) return;

    let bassEnergy = 0.2;
    let midEnergy = 0.2;
    let highEnergy = 0.2;
    if (analyser) {
      const bins = analyser.getFrequencyData(freqBuf.current);
      if (bins > 0) {
        const split1 = Math.floor(bins * 0.1);
        const split2 = Math.floor(bins * 0.4);
        bassEnergy = avg(freqBuf.current, 0, split1) / 255;
        midEnergy = avg(freqBuf.current, split1, split2) / 255;
        highEnergy = avg(freqBuf.current, split2, bins) / 255;
      }
    }

    torus.scale.setScalar(1 + bassEnergy * 0.25);
    torus.rotation.y += delta * (0.1 + midEnergy * 0.6);
    torus.rotation.x += delta * 0.04;

    const posAttr = points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const flow = delta * (0.4 + midEnergy * 2.5);
    for (let i = 0; i < particleCount; i++) {
      basePhi[i] = (basePhi[i]! + flow) % (Math.PI * 2);
      baseTheta[i] = (baseTheta[i]! + delta * (0.2 + highEnergy * 0.8)) % (Math.PI * 2);
      const radius = 1.4 + bassEnergy * 0.15;
      const tube = 0.5 + bassEnergy * 0.1;
      setTorusPoint(arr, i * 3, baseTheta[i]!, basePhi[i]!, radius, tube);
    }
    posAttr.needsUpdate = true;
  });

  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[0, 4, 4]} intensity={1.4} color={palette.mid} />
      <pointLight position={[0, -4, -4]} intensity={0.8} color={palette.bass} />

      <mesh ref={torusRef}>
        <torusGeometry args={[1.4, 0.5, tier === 'low' ? 32 : 64, tier === 'low' ? 64 : 128]} />
        <meshStandardMaterial
          color={palette.mid}
          emissive={palette.mid}
          emissiveIntensity={0.15}
          metalness={0.6}
          roughness={0.35}
          wireframe
          transparent
          opacity={0.35}
        />
      </mesh>

      <points ref={particlesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
            count={particleCount}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[colorAttr, 3]}
            count={particleCount}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.035}
          sizeAttenuation
          transparent
          opacity={0.9}
          vertexColors
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </>
  );
}

function setTorusPoint(
  arr: Float32Array,
  i: number,
  theta: number,
  phi: number,
  R: number,
  r: number,
) {
  const cos = Math.cos(phi);
  arr[i] = (R + r * Math.cos(theta)) * cos;
  arr[i + 1] = r * Math.sin(theta);
  arr[i + 2] = (R + r * Math.cos(theta)) * Math.sin(phi);
}

function avg(buf: Uint8Array, start: number, end: number): number {
  let total = 0;
  for (let i = start; i < end; i++) total += buf[i]!;
  return total / Math.max(1, end - start);
}
