'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';

const terrainVertex = /* glsl */ `
uniform float uTime;
uniform float uScroll;
uniform float uBass;
uniform float uEnergy;

varying vec2 vUv;
varying float vHeight;
varying float vDist;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vUv = uv;
  vec3 pos = position;
  vec2 sampleUv = uv * 8.0 + vec2(0.0, uScroll);
  float h = fbm(sampleUv) * 2.2;
  h += fbm(sampleUv * 2.5 + 4.0) * 0.8;
  float valley = exp(-pow((uv.x - 0.5) * 3.2, 2.0)) * 1.4;
  h -= valley;
  h *= 0.35 + uBass * 1.1;
  pos.y += h;
  vHeight = h;
  vDist = length(pos.xz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const terrainFragment = /* glsl */ `
uniform float uTime;
uniform float uMid;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uBloom;

varying vec2 vUv;
varying float vHeight;
varying float vDist;

void main() {
  vec2 grid = abs(fract(vUv * 40.0) - 0.5);
  float line = smoothstep(0.48, 0.0, min(grid.x, grid.y));
  float glow = exp(-vDist * 0.08);
  vec3 gridCol = mix(uColorA, uColorB, sin(vUv.y * 12.0 + uTime) * 0.5 + 0.5);
  vec3 col = gridCol * line * glow * (0.45 + uMid * 0.55 + vHeight * 0.25);
  col *= 1.0 + uBloom * 0.4;
  gl_FragColor = vec4(col, line * glow);
}
`;

const skyVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const skyFragment = /* glsl */ `
uniform float uTime;
uniform float uBass;
uniform float uHigh;
uniform float uBeat;

varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  vec3 sky = mix(vec3(0.02, 0.0, 0.06), vec3(0.35, 0.02, 0.25), uv.y);
  sky = mix(sky, vec3(0.05, 0.0, 0.12), smoothstep(0.0, 0.35, uv.y));

  float sunY = 0.62;
  vec2 sunCenter = vec2(0.5 + sin(uTime * 0.15) * 0.02, sunY);
  float sun = smoothstep(0.14 + uBass * 0.05, 0.0, distance(uv, sunCenter));
  vec3 sunCol = vec3(1.0, 0.25 + uBass * 0.35, 0.55) * sun;

  float bandMask = smoothstep(0.02, 0.0, abs(fract((uv.y - sunY) * 28.0 + uTime * 0.5) - 0.5));
  sunCol *= 0.6 + bandMask * 0.8;

  float shimmer = sin(uv.x * 80.0 + uTime * 6.0) * uHigh * 0.015;
  uv.x += shimmer;

  vec3 col = sky + sunCol;
  col += vec3(1.0, 0.4, 0.7) * uBeat * 0.25;
  gl_FragColor = vec4(col, 1.0);
}
`;

export function OutrunGridScene({ analyser, palette, tier }: VisualizerSceneProps) {
  const terrainMatRef = useRef<THREE.ShaderMaterial>(null);
  const skyMatRef = useRef<THREE.ShaderMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();
  const scrollRef = useRef(0);
  const beatDollyRef = useRef(0);
  const { camera } = useThree();

  const segments = tier === 'high' ? 160 : tier === 'mid' ? 96 : 64;
  const bloom = tier === 'high' ? 1 : tier === 'mid' ? 0.65 : 0.35;

  const terrainUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uEnergy: { value: 0 },
      uColorA: { value: new THREE.Color(palette.mid) },
      uColorB: { value: new THREE.Color(palette.high) },
      uBloom: { value: bloom },
    }),
    [palette.mid, palette.high, bloom],
  );

  const skyUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBass: { value: 0 },
      uHigh: { value: 0 },
      uBeat: { value: 0 },
    }),
    [],
  );

  useFrame((state, delta) => {
    const terrainMat = terrainMatRef.current;
    const skyMat = skyMatRef.current;
    if (!terrainMat || !skyMat) return;

    const m = metricsRef.current;
    scrollRef.current += delta * (0.45 + m.energy * 1.6);
    beatDollyRef.current = Math.max(0, beatDollyRef.current - delta * 4);
    if (m.beat > 0.35) beatDollyRef.current = 1;

    terrainMat.uniforms.uTime!.value = state.clock.elapsedTime;
    terrainMat.uniforms.uScroll!.value = scrollRef.current;
    terrainMat.uniforms.uBass!.value = m.bass + m.beat * 0.35;
    terrainMat.uniforms.uMid!.value = m.mid;
    terrainMat.uniforms.uEnergy!.value = m.energy;
    (terrainMat.uniforms.uColorA!.value as THREE.Color).set(palette.mid);
    (terrainMat.uniforms.uColorB!.value as THREE.Color).set(palette.high);

    skyMat.uniforms.uTime!.value = state.clock.elapsedTime;
    skyMat.uniforms.uBass!.value = m.bass;
    skyMat.uniforms.uHigh!.value = m.high;
    skyMat.uniforms.uBeat!.value = m.beat;

    camera.position.z = 3.2 + beatDollyRef.current * 0.35;
    camera.position.y = 1.4 + m.mid * 0.15;
    camera.lookAt(0, 0.2, -6);

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  return (
    <>
      <mesh position={[0, 1.5, -18]} scale={[40, 22, 1]}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          ref={skyMatRef}
          vertexShader={skyVertex}
          fragmentShader={skyFragment}
          uniforms={skyUniforms}
          depthWrite={false}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2.35, 0, 0]} position={[0, -0.8, -2]}>
        <planeGeometry args={[28, 36, segments, segments]} />
        <shaderMaterial
          ref={terrainMatRef}
          vertexShader={terrainVertex}
          fragmentShader={terrainFragment}
          uniforms={terrainUniforms}
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </>
  );
}
