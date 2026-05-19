'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';

export function SpectralTunnelScene({ analyser, palette, tier }: VisualizerSceneProps) {
  const tunnelRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();

  const segments = tier === 'high' ? 256 : tier === 'mid' ? 128 : 64;
  const radial = tier === 'low' ? 32 : 64;

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
      uBeat: { value: 0 },
      uEnergy: { value: 0 },
      uBassColor: { value: new THREE.Color(palette.bass) },
      uMidColor: { value: new THREE.Color(palette.mid) },
      uHighColor: { value: new THREE.Color(palette.high) },
    }),
    [palette],
  );

  useFrame((_state, delta) => {
    const tunnel = tunnelRef.current;
    const mat = matRef.current;
    if (!tunnel || !mat) return;

    const m = metricsRef.current;
    uniforms.uTime.value += delta * (0.6 + m.energy * 1.8);
    uniforms.uBass.value = lerp(uniforms.uBass.value, m.bass, 0.25);
    uniforms.uMid.value = lerp(uniforms.uMid.value, m.mid, 0.2);
    uniforms.uHigh.value = lerp(uniforms.uHigh.value, m.high, 0.2);
    uniforms.uBeat.value = lerp(uniforms.uBeat.value, m.beat, 0.35);
    uniforms.uEnergy.value = lerp(uniforms.uEnergy.value, m.energy, 0.15);

    tunnel.rotation.z += delta * (0.08 + m.mid * 0.5);
    tunnel.position.z = Math.sin(_state.clock.elapsedTime * 0.5) * m.breath * 0.3;

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  return (
    <mesh ref={tunnelRef} rotation={[0, 0, 0]}>
      <cylinderGeometry args={[3, 3, 20, radial, segments, true]} />
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        side={THREE.BackSide}
        transparent
        depthWrite={false}
        vertexShader={`
          uniform float uTime;
          uniform float uBass;
          uniform float uMid;
          uniform float uBeat;
          varying vec3 vWorldPos;
          varying float vDisplace;

          void main() {
            vec3 p = position;
            float wave = sin(p.y * 2.0 + uTime * 1.2) * uBass * 0.9;
            wave += cos(p.y * 4.0 - uTime * 0.6) * uMid * 0.45;
            wave += sin(p.y * 8.0 + uTime * 2.0) * uBeat * 0.5;
            p += normal * wave;
            vDisplace = wave;
            vWorldPos = (modelMatrix * vec4(p, 1.0)).xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `}
        fragmentShader={`
          uniform float uTime;
          uniform float uHigh;
          uniform float uEnergy;
          uniform float uBeat;
          uniform vec3 uBassColor;
          uniform vec3 uMidColor;
          uniform vec3 uHighColor;
          varying vec3 vWorldPos;
          varying float vDisplace;

          void main() {
            float t = smoothstep(-0.5, 0.7, sin(vWorldPos.y * 1.5 + uTime));
            vec3 col = mix(uBassColor, uMidColor, t);
            col = mix(col, uHighColor, uHigh * 0.8 + abs(vDisplace) * 0.5);
            col *= 0.85 + uEnergy * 0.35 + uBeat * 0.25;
            float alpha = 0.55 + uHigh * 0.3 + uEnergy * 0.2;
            gl_FragColor = vec4(col, alpha);
          }
        `}
      />
    </mesh>
  );
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
