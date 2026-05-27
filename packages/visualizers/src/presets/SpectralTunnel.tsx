'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';

const FFT_BINS = 64;

const tunnelVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const tunnelFragment = /* glsl */ `
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uBeat;
uniform float uEnergy;
uniform float uHue;
uniform float uChromAb;
uniform float uFft[64];
uniform vec3 uBassColor;
uniform vec3 uMidColor;
uniform vec3 uHighColor;

varying vec2 vUv;

vec3 hueShift(vec3 col, float h) {
  float angle = h * 6.28318;
  mat3 rot = mat3(
    0.299 + 0.701 * cos(angle) + 0.168 * sin(angle),
    0.587 - 0.587 * cos(angle) + 0.330 * sin(angle),
    0.114 - 0.114 * cos(angle) - 0.497 * sin(angle),
    0.299 - 0.299 * cos(angle) - 0.328 * sin(angle),
    0.587 + 0.413 * cos(angle) + 0.035 * sin(angle),
    0.114 - 0.114 * cos(angle) + 0.292 * sin(angle),
    0.299 - 0.300 * cos(angle) + 1.250 * sin(angle),
    0.587 - 0.588 * cos(angle) - 1.050 * sin(angle),
    0.114 + 0.886 * cos(angle) - 0.203 * sin(angle)
  );
  return clamp(rot * col, 0.0, 1.0);
}

void main() {
  vec2 uv = (vUv - 0.5) * 2.0;
  uv.x *= 1.0 + uChromAb * 0.02 * sign(uv.x);

  float speed = 0.55 + uEnergy * 2.2;
  float z = mod(uTime * speed, 20.0);
  float radius = 0.55 - uBass * 0.12 + sin(uTime * 0.7) * 0.03;

  vec2 p = uv;
  float r = length(p);
  float angle = atan(p.y, p.x);
  float tunnel = abs(r - radius);

  float ringIdx = fract(angle / 6.28318 * float(64) + z * 0.35);
  int bin = int(floor(ringIdx * 64.0));
  float fftVal = uFft[clamp(bin, 0, 63)];

  float depth = 1.0 / (tunnel * 8.0 + 0.02);
  depth *= 1.0 / (abs(p.x) * 0.4 + 0.15);

  float rings = sin(angle * 32.0 - z * 4.0 + fftVal * 6.0) * 0.5 + 0.5;
  rings *= smoothstep(radius + 0.35, radius, r) * smoothstep(radius - 0.35, radius, r);

  vec3 base = mix(uBassColor, uMidColor, uMid);
  base = mix(base, uHighColor, uHigh * 0.8);
  base = hueShift(base, uHue);

  vec3 col = base * (depth * 0.08 + rings * (0.35 + fftVal * 1.2));
  col += vec3(1.0) * uBeat * 0.35 * rings;
  col *= 0.7 + uEnergy * 0.5;

  float vig = smoothstep(1.4, 0.2, length(uv));
  gl_FragColor = vec4(col * vig, 1.0);
}
`;

export function SpectralTunnelScene({ analyser, palette }: VisualizerSceneProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const fftUniform = useRef(new Float32Array(FFT_BINS));
  const metricsRef = useMetricsRef();
  const chromAbRef = useRef(0);
  const beatFovRef = useRef(0);
  const { camera } = useThree();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
      uBeat: { value: 0 },
      uEnergy: { value: 0 },
      uHue: { value: 0 },
      uChromAb: { value: 0 },
      uFft: { value: fftUniform.current },
      uBassColor: { value: new THREE.Color(palette.bass) },
      uMidColor: { value: new THREE.Color(palette.mid) },
      uHighColor: { value: new THREE.Color(palette.high) },
    }),
    [palette],
  );

  useFrame((state, delta) => {
    const mat = matRef.current;
    if (!mat) return;

    const m = metricsRef.current;
    mat.uniforms.uTime!.value = state.clock.elapsedTime;
    mat.uniforms.uBass!.value = m.bass;
    mat.uniforms.uMid!.value = m.mid;
    mat.uniforms.uHigh!.value = m.high;
    mat.uniforms.uBeat!.value = m.beat;
    mat.uniforms.uEnergy!.value = m.energy;

    chromAbRef.current = Math.max(0, chromAbRef.current - delta * 5);
    beatFovRef.current = Math.max(0, beatFovRef.current - delta * 4);
    if (m.beat > 0.35) {
      chromAbRef.current = 1;
      beatFovRef.current = 1;
    }
    mat.uniforms.uChromAb!.value = chromAbRef.current;

    if (analyser) {
      const bins = analyser.getFrequencyData(freqBuf.current);
      let weighted = 0;
      let total = 0;
      for (let i = 0; i < FFT_BINS; i++) {
        const start = Math.floor((i / FFT_BINS) * bins);
        const end = Math.floor(((i + 1) / FFT_BINS) * bins);
        let sum = 0;
        for (let j = start; j < end; j++) sum += freqBuf.current[j] ?? 0;
        const avg = sum / Math.max(1, end - start) / 255;
        fftUniform.current[i] = avg;
        weighted += avg * i;
        total += avg;
      }
      mat.uniforms.uHue!.value = total > 0 ? weighted / total / FFT_BINS : 0.5;
      mat.uniforms.uFft!.value = fftUniform.current;
    }

    camera.rotation.z = Math.sin(state.clock.elapsedTime * 0.08) * 0.04 + m.mid * 0.02;
    if ('fov' in camera && typeof camera.fov === 'number') {
      camera.fov = 50 + beatFovRef.current * 8;
      camera.updateProjectionMatrix();
    }
  });

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={tunnelVertex}
        fragmentShader={tunnelFragment}
        uniforms={uniforms}
        depthWrite={false}
      />
    </mesh>
  );
}
