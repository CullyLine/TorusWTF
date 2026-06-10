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

const FOLDS = 8;

export function CosmicMandalaScene({ analyser, palette, tier }: VisualizerSceneProps) {
  const groupRef = useRef<THREE.Group>(null);
  const ringsRef = useRef<THREE.Group>(null);
  const shimmerRef = useRef<THREE.Points>(null);
  const shimmerMatRef = useRef<THREE.PointsMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();
  const pulseRef = useRef(0);

  const layerCount = tier === 'high' ? 7 : tier === 'mid' ? 5 : 3;
  const shimmerCount = tier === 'high' ? 900 : tier === 'mid' ? 420 : 180;
  // Flow Field Update: the shimmer halo is advected through the shared curl
  // current with a spring back to its home ring — fluid swirl, stable form.
  const flowParamsRef = useRef<FlowParams>({ ...DEFAULT_FLOW_PARAMS });
  const flowTimeRef = useRef(0);
  const flowScratch = useRef<Vec3Like>({ x: 0, y: 0, z: 0 });

  const { shimmerPos, shimmerHome } = useMemo(() => {
    const p = new Float32Array(shimmerCount * 3);
    const home = new Float32Array(shimmerCount * 3);
    for (let i = 0; i < shimmerCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 2.2 + Math.random() * 1.4;
      p[i * 3] = Math.cos(a) * r;
      p[i * 3 + 1] = (Math.random() - 0.5) * 0.25;
      p[i * 3 + 2] = Math.sin(a) * r;
      home[i * 3] = p[i * 3]!;
      home[i * 3 + 1] = p[i * 3 + 1]!;
      home[i * 3 + 2] = p[i * 3 + 2]!;
    }
    return { shimmerPos: p, shimmerHome: home };
  }, [shimmerCount]);

  const shimmerColors = useMemo(() => {
    const c = new Float32Array(shimmerCount * 3);
    const high = new THREE.Color(palette.high);
    for (let i = 0; i < shimmerCount; i++) {
      c[i * 3] = high.r;
      c[i * 3 + 1] = high.g;
      c[i * 3 + 2] = high.b;
    }
    return c;
  }, [shimmerCount, palette.high]);

  useFrame((_state, delta) => {
    const root = groupRef.current;
    const rings = ringsRef.current;
    const shimmer = shimmerRef.current;
    const shimmerMat = shimmerMatRef.current;
    if (!root || !rings) return;

    const m = metricsRef.current;
    pulseRef.current = Math.max(0, pulseRef.current - delta * 2.5);
    if (m.beat > 0.55) pulseRef.current = 1;

    const breath = 1 + m.bass * 0.22 + m.breath * 0.12 + pulseRef.current * 0.18;
    root.scale.setScalar(breath);
    // Whole-mandala spin: now picks up mid + high + beat so the wheel
    // visibly turns at normal listening gain instead of waiting for the
    // user to crank everything to mad-scientist mode.
    root.rotation.y +=
      delta * (0.18 + m.mid * 0.65 + m.high * 0.28 + m.beat * 0.5);

    rings.children.forEach((child, i) => {
      // Per-ring spin: was 0.12 + i*0.04 + m.mid*0.5. That made the inner
      // rings barely turn unless gain was huge. Tripled the music-driven
      // term and added high + beat so each ring flies on energy.
      const speed =
        0.22 + i * 0.05 + m.mid * 1.7 + m.high * 0.95 + m.beat * 0.6;
      child.rotation.z += delta * speed * (i % 2 === 0 ? 1 : -1);
      child.rotation.x =
        Math.sin(_state.clock.elapsedTime * 0.4 + i) * (m.high * 0.35 + m.mid * 0.12);
      const mat = (child as THREE.Mesh).material;
      if (mat && !Array.isArray(mat) && 'emissiveIntensity' in mat) {
        (mat as THREE.MeshStandardMaterial).emissiveIntensity =
          0.08 + m.flow * 0.35 + (i === layerCount - 1 ? m.beat * 0.25 : 0);
      }
    });

    if (shimmer && shimmerMat) {
      shimmerMat.size = 0.02 + m.high * 0.05 + pulseRef.current * 0.03;
      shimmerMat.opacity = 0.35 + m.high * 0.5;
      // Counter-rotating shimmer cloud — also bumped up so it streaks
      // visibly across the rings on busy passages.
      shimmer.rotation.y -= delta * (0.35 + m.high * 1.6 + m.mid * 0.5);

      // Advect the halo through the shared current, spring-tethered to its
      // home ring so the mandala's silhouette survives the swirl.
      const dtClamped = Math.min(delta, 0.05);
      flowTimeRef.current += dtClamped * (0.4 + Math.min(m.energy, 1.5) * 0.4);
      const fp = flowParamsFromMetrics(m, flowParamsRef.current);
      fp.time = flowTimeRef.current;
      const drift = dtClamped * (0.3 + m.energy * 0.7 + m.dropEvent * 1.4);
      const spring = dtClamped * 1.6;
      const fv = flowScratch.current;
      const posAttr = shimmer.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      for (let i = 0; i < shimmerCount; i++) {
        const i3 = i * 3;
        sampleFlow(fv, arr[i3]!, arr[i3 + 1]!, arr[i3 + 2]!, i % 3, fp);
        arr[i3] = arr[i3]! + fv.x * drift + (shimmerHome[i3]! - arr[i3]!) * spring;
        arr[i3 + 1] = arr[i3 + 1]! + fv.y * drift + (shimmerHome[i3 + 1]! - arr[i3 + 1]!) * spring;
        arr[i3 + 2] = arr[i3 + 2]! + fv.z * drift + (shimmerHome[i3 + 2]! - arr[i3 + 2]!) * spring;
      }
      posAttr.needsUpdate = true;
    }

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  const layers = useMemo(() => {
    return Array.from({ length: layerCount }, (_, i) => {
      const t = i / Math.max(1, layerCount - 1);
      const radius = 0.55 + t * 1.05;
      const tube = 0.08 + (1 - t) * 0.06;
      const color = i % 3 === 0 ? palette.bass : i % 3 === 1 ? palette.mid : palette.high;
      return { radius, tube, color, key: i };
    });
  }, [layerCount, palette]);

  return (
    <group ref={groupRef}>
      <group ref={ringsRef}>
        {layers.map(({ radius, tube, color, key }) => (
          <group key={key} rotation={[Math.PI / 2, 0, (key / FOLDS) * Math.PI * 2]}>
            {Array.from({ length: FOLDS }, (_, f) => (
              <mesh key={f} rotation={[0, 0, (f / FOLDS) * Math.PI * 2]}>
                <torusGeometry args={[radius, tube, 24, 48]} />
                <meshStandardMaterial
                  color={color}
                  emissive={color}
                  emissiveIntensity={0.12}
                  metalness={0.55}
                  roughness={0.4}
                  wireframe
                  transparent
                  opacity={0.42 - key * 0.03}
                />
              </mesh>
            ))}
          </group>
        ))}
      </group>

      <points ref={shimmerRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[shimmerPos, 3]} count={shimmerCount} itemSize={3} />
          <bufferAttribute attach="attributes-color" args={[shimmerColors, 3]} count={shimmerCount} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial
          ref={shimmerMatRef}
          size={0.03}
          sizeAttenuation
          transparent
          opacity={0.7}
          vertexColors
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}
