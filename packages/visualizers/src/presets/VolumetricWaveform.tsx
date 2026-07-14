'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';

import { getDotTexture } from '../dotTexture';

export function VolumetricWaveformScene({ analyser, palette, tier, speed = 1 }: VisualizerSceneProps) {
  const groupRef = useRef<THREE.Group>(null);
  const lineRef = useRef<THREE.LineSegments>(null);
  const dustRef = useRef<THREE.Points>(null);
  const timeBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();
  const scratchBass = useRef(new THREE.Color());
  const scratchMid = useRef(new THREE.Color());
  const scratchHigh = useRef(new THREE.Color());
  const sprite = useMemo(() => getDotTexture(), []);

  const samples = tier === 'high' ? 512 : tier === 'mid' ? 256 : 128;
  const dustCount = tier === 'high' ? 2000 : tier === 'mid' ? 900 : 400;

  const positions = useMemo(() => new Float32Array(samples * 2 * 3), [samples]);
  const colors = useMemo(() => {
    const c = new Float32Array(samples * 2 * 3);
    const bass = new THREE.Color(palette.bass);
    const mid = new THREE.Color(palette.mid);
    const high = new THREE.Color(palette.high);
    for (let i = 0; i < samples * 2; i++) {
      const t = i / (samples * 2);
      const color = t < 0.33 ? bass : t < 0.66 ? mid : high;
      c[i * 3] = color.r;
      c[i * 3 + 1] = color.g;
      c[i * 3 + 2] = color.b;
    }
    return c;
  }, [samples, palette]);

  const { dustPos, dustVel } = useMemo(() => {
    const p = new Float32Array(dustCount * 3);
    const v = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      p[i * 3] = (Math.random() - 0.5) * 5;
      p[i * 3 + 1] = (Math.random() - 0.5) * 3;
      p[i * 3 + 2] = (Math.random() - 0.5) * 2;
      v[i * 3] = (Math.random() - 0.5) * 0.01;
      v[i * 3 + 1] = Math.random() * 0.02;
      v[i * 3 + 2] = (Math.random() - 0.5) * 0.01;
    }
    return { dustPos: p, dustVel: v };
  }, [dustCount]);

  useFrame((_state, delta) => {
    const line = lineRef.current;
    const group = groupRef.current;
    const dust = dustRef.current;
    if (!line || !group) return;

    const m = metricsRef.current;
    group.rotation.y += delta * speed * (0.1 + m.mid * 0.4 + m.impact * 0.2);
    group.scale.setScalar(1 + m.swell * 0.1 + m.impact * 0.06);

    // Live palette: re-tint the waveform gradient every frame so color life
    // and palette swaps reach the line (the mount-time buffer stays frozen).
    const cAttr = line.geometry.getAttribute('color') as THREE.BufferAttribute;
    const cArr = cAttr.array as Float32Array;
    const bassC = scratchBass.current.set(palette.bass);
    const midC = scratchMid.current.set(palette.mid);
    const highC = scratchHigh.current.set(palette.high);
    const vertCount = samples * 2;
    for (let i = 0; i < vertCount; i++) {
      const t = i / vertCount;
      const color = t < 0.33 ? bassC : t < 0.66 ? midC : highC;
      cArr[i * 3] = color.r;
      cArr[i * 3 + 1] = color.g;
      cArr[i * 3 + 2] = color.b;
    }
    cAttr.needsUpdate = true;

    if (analyser) {
      const bins = analyser.getTimeDomainData(timeBuf.current);
      if (bins > 0) {
        const arr = line.geometry.getAttribute('position').array as Float32Array;
        const amp = 1.2 + m.energy * 1.3 + m.impact * 0.8;
        for (let i = 0; i < samples; i++) {
          const src = Math.floor((i / samples) * bins);
          const v = (timeBuf.current[src]! / 128 - 1) * amp;
          const x = (i / samples) * 6 - 3;
          const baseIdx = i * 6;
          arr[baseIdx] = x;
          arr[baseIdx + 1] = v;
          arr[baseIdx + 2] = Math.sin(i * 0.1 + _state.clock.elapsedTime) * m.mid * 0.2;
          arr[baseIdx + 3] = x;
          arr[baseIdx + 4] = -v;
          arr[baseIdx + 5] = -arr[baseIdx + 2]!;
        }
        (line.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      }
    }

    if (dust) {
      const mat = dust.material as THREE.PointsMaterial;
      mat.size = 0.035 + m.flow * 0.05;
      mat.opacity = 0.3 + m.swell * 0.55;
      mat.color.set(palette.mid);
      const posAttr = dust.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const drive = delta * speed * (0.5 + m.energy * 3.5 + m.impact * 3);
      const active = 0.2 + m.flow * 0.8;
      for (let i = 0; i < dustCount; i++) {
        if (i / dustCount > active) continue;
        const i3 = i * 3;
        arr[i3] = (arr[i3] ?? 0) + (dustVel[i3] ?? 0) * drive * 20;
        arr[i3 + 1] = (arr[i3 + 1] ?? 0) + (dustVel[i3 + 1] ?? 0) * drive * 20;
        arr[i3 + 2] = (arr[i3 + 2] ?? 0) + (dustVel[i3 + 2] ?? 0) * drive * 20;
        if (Math.abs(arr[i3 + 1]!) > 2.5) arr[i3 + 1] = 0;
      }
      posAttr.needsUpdate = true;
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
          linewidth={1}
        />
      </lineSegments>
      <points ref={dustRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[dustPos, 3]} count={dustCount} />
        </bufferGeometry>
        <pointsMaterial
          color={palette.mid}
          size={0.04}
          map={sprite}
          sizeAttenuation
          transparent
          opacity={0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </group>
  );
}
