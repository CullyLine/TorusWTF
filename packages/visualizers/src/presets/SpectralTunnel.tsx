'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';

/**
 * **Spectral Tunnel** — flying through a tube whose walls displace on bass and
 * color-shift on highs. Best fit for melodic / atmospheric material.
 */
export function SpectralTunnelScene({ analyser, palette, tier }: VisualizerSceneProps) {
  const tunnelRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));

  const segments = tier === 'high' ? 256 : tier === 'mid' ? 128 : 64;
  const radial = tier === 'low' ? 32 : 64;

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
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

    let bass = 0.2;
    let mid = 0.2;
    let high = 0.2;
    if (analyser) {
      const bins = analyser.getFrequencyData(freqBuf.current);
      if (bins > 0) {
        const s1 = Math.floor(bins * 0.1);
        const s2 = Math.floor(bins * 0.4);
        bass = avg(freqBuf.current, 0, s1) / 255;
        mid = avg(freqBuf.current, s1, s2) / 255;
        high = avg(freqBuf.current, s2, bins) / 255;
      }
    }

    uniforms.uTime.value += delta;
    uniforms.uBass.value = lerp(uniforms.uBass.value, bass, 0.2);
    uniforms.uMid.value = lerp(uniforms.uMid.value, mid, 0.2);
    uniforms.uHigh.value = lerp(uniforms.uHigh.value, high, 0.2);
    tunnel.rotation.z += delta * 0.1;
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
          varying vec3 vWorldPos;
          varying float vDisplace;

          void main() {
            vec3 p = position;
            float wave = sin(p.y * 2.0 + uTime * 1.2) * uBass * 0.6;
            wave += cos(p.y * 4.0 - uTime * 0.6) * uMid * 0.3;
            p += normal * wave;
            vDisplace = wave;
            vWorldPos = (modelMatrix * vec4(p, 1.0)).xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `}
        fragmentShader={`
          uniform float uTime;
          uniform float uHigh;
          uniform vec3 uBassColor;
          uniform vec3 uMidColor;
          uniform vec3 uHighColor;
          varying vec3 vWorldPos;
          varying float vDisplace;

          void main() {
            float t = smoothstep(-0.5, 0.7, sin(vWorldPos.y * 1.5 + uTime));
            vec3 col = mix(uBassColor, uMidColor, t);
            col = mix(col, uHighColor, uHigh * 0.7 + abs(vDisplace) * 0.4);
            float alpha = 0.65 + uHigh * 0.25;
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

function avg(buf: Uint8Array, start: number, end: number): number {
  let total = 0;
  for (let i = start; i < end; i++) total += buf[i]!;
  return total / Math.max(1, end - start);
}
