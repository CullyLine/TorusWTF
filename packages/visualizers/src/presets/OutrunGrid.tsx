'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';

const gridVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const gridFragment = /* glsl */ `
uniform float uTime;
uniform float uScroll;
uniform float uBass;
uniform float uMid;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uBloom;
varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  float horizon = 0.52 + uMid * 0.04;
  float z = 1.0 / max(0.08, (uv.y - horizon) * 6.0 + 0.15);
  float x = (uv.x - 0.5) * z;
  float gridX = abs(fract(x * 0.35 - uScroll) - 0.5);
  float gridZ = abs(fract(z * 0.22 + uScroll * 0.6) - 0.5);
  float line = smoothstep(0.48, 0.5, min(gridX, gridZ));
  float fade = smoothstep(horizon, 1.0, uv.y);
  vec3 gridCol = mix(uColorA, uColorB, sin(uTime * 0.3 + z * 0.1) * 0.5 + 0.5);
  vec3 col = gridCol * line * fade * (0.35 + uBass * 0.65);
  float sunY = horizon + 0.08;
  float sun = smoothstep(0.12 + uBass * 0.08, 0.0, distance(uv, vec2(0.5, sunY)));
  vec3 sunCol = vec3(1.0, 0.35 + uBass * 0.4, 0.55 + uBass * 0.3) * sun * (0.7 + uBass);
  float mountain = smoothstep(horizon - 0.02, horizon + 0.02, uv.y);
  float ridge = sin(uv.x * 12.0 + uMid * 4.0) * 0.015 + sin(uv.x * 5.0) * 0.02;
  float mt = step(uv.y, horizon + ridge) * mountain;
  vec3 sky = mix(vec3(0.02, 0.0, 0.08), vec3(0.15, 0.02, 0.2), uv.y);
  col = mix(sky, col + sunCol, 1.0 - mt);
  col *= 1.0 + uBloom * 0.35;
  gl_FragColor = vec4(col, 1.0);
}
`;

export function OutrunGridScene({ analyser, palette, tier }: VisualizerSceneProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();
  const scrollRef = useRef(0);

  const bloom = tier === 'high' ? 1 : tier === 'mid' ? 0.65 : 0.35;

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uColorA: { value: new THREE.Color(palette.mid) },
      uColorB: { value: new THREE.Color(palette.high) },
      uBloom: { value: bloom },
    }),
    [palette.mid, palette.high, bloom],
  );

  useFrame((state, delta) => {
    const mat = matRef.current;
    if (!mat) return;
    const m = metricsRef.current;
    scrollRef.current += delta * (0.35 + m.mid * 1.2);
    mat.uniforms.uTime!.value = state.clock.elapsedTime;
    mat.uniforms.uScroll!.value = scrollRef.current;
    mat.uniforms.uBass!.value = m.bass + m.beat * 0.4;
    mat.uniforms.uMid!.value = m.mid;
    (mat.uniforms.uColorA!.value as THREE.Color).set(palette.mid);
    (mat.uniforms.uColorB!.value as THREE.Color).set(palette.high);

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  return (
    <>
      <mesh rotation={[-Math.PI / 2.15, 0, 0]} position={[0, -0.5, -1.2]}>
        <planeGeometry args={[14, 10, 1, 1]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={gridVertex}
          fragmentShader={gridFragment}
          uniforms={uniforms}
          side={THREE.DoubleSide}
        />
      </mesh>
    </>
  );
}
