'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';

export function TorusFieldScene({ analyser, palette, tier }: VisualizerSceneProps) {
  const torusRef = useRef<THREE.Mesh>(null);
  const particlesRef = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();

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
      const t = (i / particleCount) % 1;
      const color = t < 0.33 ? bass : t < 0.66 ? mid : high;
      c[i * 3] = color.r;
      c[i * 3 + 1] = color.g;
      c[i * 3 + 2] = color.b;
    }
    return c;
  }, [particleCount, palette]);

  useFrame((_state, delta) => {
    const torus = torusRef.current;
    const points = particlesRef.current;
    const pointsMat = matRef.current;
    if (!torus || !points || !pointsMat) return;

    const m = metricsRef.current;
    const flowSpeed = delta * (0.35 + m.mid * 3.5 + m.beat * 2);
    const activeRatio = 0.3 + m.flow * 0.7;

    torus.scale.setScalar(1 + m.bass * 0.35 + m.beat * 0.15);
    torus.rotation.y += flowSpeed * 0.4;
    torus.rotation.x += delta * (0.03 + m.high * 0.2);

    // Downbeat flash: peaks at the start of each 4/4 bar then decays in <0.5 beats.
    const barFlash = m.barPhase > 0 ? Math.pow(1 - m.barPhase, 8) : 0;

    const torusMat = torus.material;
    if (torusMat && !Array.isArray(torusMat) && 'emissiveIntensity' in torusMat) {
      (torusMat as THREE.MeshStandardMaterial).emissiveIntensity =
        0.1 + m.breath * 0.5 + m.beat * 0.3 + barFlash * 0.7;
    }

    pointsMat.size = 0.02 + m.energy * 0.05;
    pointsMat.opacity = 0.5 + m.flow * 0.45;

    const posAttr = points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;

    for (let i = 0; i < particleCount; i++) {
      if (i / particleCount > activeRatio) continue;
      basePhi[i] = (basePhi[i]! + flowSpeed) % (Math.PI * 2);
      baseTheta[i] = (baseTheta[i]! + delta * (0.15 + m.high * 1.2 + m.beat)) % (Math.PI * 2);
      const radius = 1.4 + m.bass * 0.25 + Math.sin(basePhi[i]! * 3) * m.mid * 0.08;
      const tube = 0.5 + m.breath * 0.15;
      setTorusPoint(arr, i * 3, baseTheta[i]!, basePhi[i]!, radius, tube);
    }
    posAttr.needsUpdate = true;

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  return (
    <>
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
          ref={matRef}
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
