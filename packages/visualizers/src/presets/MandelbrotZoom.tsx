'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';

const CENTER_X = -0.743643887037151;
const CENTER_Y = 0.131825904205330;
const MAX_ZOOM = 1e6;
const FADE_DURATION = 0.8;

function buildFragmentShader(maxIter: number): string {
  return /* glsl */ `
#define MAX_ITER ${maxIter}

uniform float uZoom;
uniform float uHueShift;
uniform float uBassPulse;
uniform float uHigh;
uniform float uFade;
uniform vec3 uBassColor;
uniform vec3 uMidColor;
uniform vec3 uHighColor;
varying vec2 vUv;

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 paletteGradient(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 col = mix(uBassColor, uMidColor, smoothstep(0.0, 0.55, t));
  col = mix(col, uHighColor, smoothstep(0.45, 1.0, t));
  return col;
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(1.78, 1.0);
  vec2 c = vec2(${CENTER_X}, ${CENTER_Y}) + uv * (4.0 / uZoom);

  vec2 z = vec2(0.0);
  float iter = 0.0;
  for (int i = 0; i < MAX_ITER; i++) {
    if (dot(z, z) > 4.0) break;
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    iter = float(i + 1);
  }

  vec3 col;
  if (iter >= float(MAX_ITER) - 0.5) {
    col = uBassColor * 0.05;
  } else {
    float t = iter / float(MAX_ITER);
    col = paletteGradient(t);
    vec3 hsv = rgb2hsv(col);
    hsv.x = fract(hsv.x + uHueShift);
    hsv.y = clamp(hsv.y + uBassPulse * 0.35, 0.0, 1.0);
    col = hsv2rgb(hsv);
    float aberr = uHigh * 0.012 * (1.0 - t);
    col.r += aberr;
    col.b -= aberr;
    col *= 0.85 + t * 0.35 + uBassPulse * 0.25;
  }

  col *= 1.0 - uFade * 0.85;
  gl_FragColor = vec4(col, 1.0);
}
`;
}

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export function MandelbrotZoomScene({ analyser, palette, tier }: VisualizerSceneProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();
  const zoomRef = useRef(2.0);
  const hueRef = useRef(0);
  const fadeRef = useRef(0);
  const fadePhaseRef = useRef<'idle' | 'out' | 'in'>('idle');

  const maxIter = tier === 'high' ? 192 : tier === 'mid' ? 128 : 72;
  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const fragmentShader = useMemo(() => buildFragmentShader(maxIter), [maxIter]);

  const uniforms = useMemo(
    () => ({
      uZoom: { value: 2.0 },
      uHueShift: { value: 0 },
      uBassPulse: { value: 0 },
      uHigh: { value: 0 },
      uFade: { value: 0 },
      uBassColor: { value: new THREE.Color(palette.bass) },
      uMidColor: { value: new THREE.Color(palette.mid) },
      uHighColor: { value: new THREE.Color(palette.high) },
    }),
    [palette.bass, palette.mid, palette.high],
  );

  useFrame((_state, delta) => {
    const mat = matRef.current;
    if (!mat) return;

    const m = metricsRef.current;
    let zoomRate = 0.18 + m.energy * 0.45 + m.beat * 0.6;
    let hueRate = 0.15 + m.mid * 0.8;
    if (reducedMotion) {
      zoomRate = Math.min(zoomRate, 0.08);
      hueRate /= 3;
    }

    if (fadePhaseRef.current === 'idle') {
      zoomRef.current *= Math.exp(delta * zoomRate);
      if (zoomRef.current >= MAX_ZOOM) {
        fadePhaseRef.current = 'out';
      }
    }

    if (fadePhaseRef.current === 'out') {
      fadeRef.current = Math.min(1, fadeRef.current + delta / (FADE_DURATION * 0.5));
      if (fadeRef.current >= 1) {
        zoomRef.current = 2.0;
        fadePhaseRef.current = 'in';
      }
    } else if (fadePhaseRef.current === 'in') {
      fadeRef.current = Math.max(0, fadeRef.current - delta / (FADE_DURATION * 0.5));
      if (fadeRef.current <= 0) {
        fadePhaseRef.current = 'idle';
      }
    }

    hueRef.current = (hueRef.current + delta * hueRate) % 1;

    mat.uniforms.uZoom!.value = zoomRef.current;
    mat.uniforms.uHueShift!.value = hueRef.current;
    mat.uniforms.uBassPulse!.value = m.bass + m.beat * 0.35;
    mat.uniforms.uHigh!.value = m.high;
    mat.uniforms.uFade!.value = fadeRef.current;
    (mat.uniforms.uBassColor!.value as THREE.Color).set(palette.bass);
    (mat.uniforms.uMidColor!.value as THREE.Color).set(palette.mid);
    (mat.uniforms.uHighColor!.value as THREE.Color).set(palette.high);

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  return (
    <mesh position={[0, 0, 0]}>
      <planeGeometry args={[3.8, 3.8]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}
