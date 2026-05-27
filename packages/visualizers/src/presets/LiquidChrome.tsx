'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uEnergy;
uniform float uBeat;

varying vec3 vNormal;
varying vec3 vViewDir;
varying float vNoise;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * snoise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 pos = position;
  vec3 n = normalize(normal);
  float t = uTime;
  float disp = 0.12 + uBass * 0.35 + uBeat * 0.25 + uEnergy * 0.08;
  vec3 samplePos = pos * 2.1 + vec3(t * 0.35, t * 0.28, t * 0.22);
  float noise = fbm(samplePos + uMid * 0.35);
  vNoise = noise;
  pos += n * noise * disp;

  float eps = 0.02;
  float nx = fbm(samplePos + vec3(eps, 0.0, 0.0)) - fbm(samplePos - vec3(eps, 0.0, 0.0));
  float ny = fbm(samplePos + vec3(0.0, eps, 0.0)) - fbm(samplePos - vec3(0.0, eps, 0.0));
  float nz = fbm(samplePos + vec3(0.0, 0.0, eps)) - fbm(samplePos - vec3(0.0, 0.0, eps));
  vec3 grad = normalize(vec3(nx, ny, nz));
  vNormal = normalize(normalMatrix * grad);

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  vViewDir = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uEnergy;
uniform float uBeat;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uEmissive;

varying vec3 vNormal;
varying vec3 vViewDir;
varying float vNoise;

vec3 envColor(vec3 dir) {
  float t = dir.y * 0.5 + 0.5;
  vec3 top = vec3(0.15, 0.35, 0.55);
  vec3 horizon = vec3(0.55, 0.12, 0.35);
  vec3 ground = vec3(0.02, 0.02, 0.06);
  vec3 sky = mix(horizon, top, smoothstep(0.0, 0.65, t));
  return mix(ground, sky, smoothstep(-0.2, 0.35, t));
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewDir);
  vec3 R = reflect(-V, N);
  vec3 env = envColor(R);

  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 base = mix(uColorA, uColorB, vNoise * 0.5 + 0.5);
  vec3 chrome = mix(base * 0.35, env, 0.55 + fresnel * 0.4);
  chrome += uEmissive * (0.15 + uEnergy * 0.45 + uBeat * 0.35);
  chrome += vec3(1.0) * fresnel * 0.35;

  gl_FragColor = vec4(chrome, 1.0);
}
`;

export function LiquidChromeScene({ analyser, palette, tier }: VisualizerSceneProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();

  const detail = tier === 'high' ? 6 : tier === 'mid' ? 5 : 4;

  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1.1, detail), [detail]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uEnergy: { value: 0 },
      uBeat: { value: 0 },
      uColorA: { value: new THREE.Color(palette.mid) },
      uColorB: { value: new THREE.Color(palette.high) },
      uEmissive: { value: new THREE.Color(palette.high) },
    }),
    [palette.mid, palette.high],
  );

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    const mat = matRef.current;
    if (!mesh || !mat) return;

    const m = metricsRef.current;
    mat.uniforms.uTime!.value = state.clock.elapsedTime;
    mat.uniforms.uBass!.value = m.bass;
    mat.uniforms.uMid!.value = m.mid;
    mat.uniforms.uEnergy!.value = m.energy;
    mat.uniforms.uBeat!.value = m.beat;
    (mat.uniforms.uColorA!.value as THREE.Color).set(palette.mid);
    (mat.uniforms.uColorB!.value as THREE.Color).set(palette.high);
    (mat.uniforms.uEmissive!.value as THREE.Color).set(palette.high);

    mesh.rotation.y += delta * (0.15 + m.mid * 0.4);
    mesh.rotation.x = Math.sin(state.clock.elapsedTime * 0.35) * 0.12 + m.high * 0.08;

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}
