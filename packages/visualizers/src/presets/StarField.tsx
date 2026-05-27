'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useCameraZoomDistanceRef } from '../cameraZoom';

const ARMS = 3;

const vertexShader = /* glsl */ `
attribute float aPhase;
attribute float aRadius;
attribute float aArm;

uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uBeat;
uniform float uEnergy;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec3 pos = position;
  float twinkle = sin(uTime * (3.0 + aPhase * 5.0) + aPhase * 40.0) * 0.5 + 0.5;
  twinkle *= 0.35 + uHigh * 0.65;

  float burst = step(0.97, fract(aPhase * 17.0 + uTime * (0.5 + uMid)));
  float sizeBoost = 1.0 + uBass * 0.4 + uBeat * 0.35 + burst * uMid * 1.8;

  float core = 1.0 - smoothstep(0.0, 2.5, aRadius);
  float rim = smoothstep(1.5, 5.0, aRadius);
  vec3 hotCore = mix(vec3(0.55, 0.75, 1.0), vec3(1.0, 0.95, 0.85), core);
  vec3 warm = mix(vec3(1.0, 0.85, 0.45), vec3(0.9, 0.35, 0.25), rim);
  vColor = mix(hotCore, warm, rim) * (0.85 + twinkle * 0.25 + core * uBass * 0.2);
  vAlpha = 0.28 + twinkle * 0.32 + core * 0.25 + uEnergy * 0.12;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  // Base size kept small: 50k+ additively-blended points saturate the framebuffer
  // (and the bloom pass) instantly if individual sprites get too large.
  gl_PointSize = (1.2 + sizeBoost * 1.4) * (22.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor * soft, vAlpha * soft);
}
`;

export function StarFieldScene({ analyser, tier }: VisualizerSceneProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();
  const zoomRef = useCameraZoomDistanceRef();
  const beatZoomRef = useRef(0);
  const { camera } = useThree();

  const count = tier === 'high' ? 50_000 : tier === 'mid' ? 24_000 : 8_000;

  const { positions, phases, radii, arms } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    const radius = new Float32Array(count);
    const arm = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const armI = i % ARMS;
      const t = Math.random();
      const r = 0.15 + Math.pow(t, 1.55) * 5.5;
      const theta = armI * ((Math.PI * 2) / ARMS) + r * 0.95 + (Math.random() - 0.5) * 0.4;
      const yThick = (Math.random() - 0.5) * Math.exp(-r * 0.35) * 0.55;

      pos[i * 3] = Math.cos(theta) * r;
      pos[i * 3 + 1] = yThick;
      pos[i * 3 + 2] = Math.sin(theta) * r;
      phase[i] = Math.random();
      radius[i] = r;
      arm[i] = armI;
    }

    return { positions: pos, phases: phase, radii: radius, arms: arm };
  }, [count]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
      uBeat: { value: 0 },
      uEnergy: { value: 0 },
    }),
    [],
  );

  useFrame((state, delta) => {
    const mat = matRef.current;
    const points = pointsRef.current;
    if (!mat || !points) return;

    const m = metricsRef.current;
    mat.uniforms.uTime!.value = state.clock.elapsedTime;
    mat.uniforms.uBass!.value = m.bass;
    mat.uniforms.uMid!.value = m.mid;
    mat.uniforms.uHigh!.value = m.high;
    mat.uniforms.uBeat!.value = m.beat;
    mat.uniforms.uEnergy!.value = m.energy;

    beatZoomRef.current = Math.max(0, beatZoomRef.current - delta * 3.5);
    if (m.beat > 0.35) beatZoomRef.current = 1;

    const sway = m.energy * 0.08;
    points.rotation.y += delta * (0.03 + m.mid * 0.06);
    points.rotation.x = Math.sin(state.clock.elapsedTime * 0.12) * 0.08 + sway;

    const baseZ = zoomRef?.current ?? 4;
    camera.position.set(
      Math.sin(state.clock.elapsedTime * 0.08) * sway * 2,
      Math.cos(state.clock.elapsedTime * 0.11) * sway,
      baseZ - beatZoomRef.current * 0.35,
    );
    camera.lookAt(0, 0, 0);

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  return (
    <points ref={pointsRef} rotation={[Math.PI / 2.05, 0, 0]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={count} itemSize={3} />
        <bufferAttribute attach="attributes-aPhase" args={[phases, 1]} count={count} itemSize={1} />
        <bufferAttribute attach="attributes-aRadius" args={[radii, 1]} count={count} itemSize={1} />
        <bufferAttribute attach="attributes-aArm" args={[arms, 1]} count={count} itemSize={1} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
