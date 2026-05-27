'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
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

uniform vec2 uResolution;
uniform float uZoom;
uniform float uPaletteShift;
uniform float uBassPulse;
uniform float uHigh;
uniform float uFade;
uniform vec3 uBassColor;
uniform vec3 uMidColor;
uniform vec3 uHighColor;
varying vec2 vUv;

// Three-stop palette ramp scrolled by uPaletteShift (audio-driven, [0,1)).
// Stays inside the user palette (bass -> mid -> high -> bass) instead of
// rotating through full HSV.
vec3 paletteRamp(float t) {
  t = fract(t + uPaletteShift);
  // Three equal stops at 0, 1/3, 2/3, looping back at 1.
  if (t < 1.0 / 3.0) {
    return mix(uBassColor, uMidColor, smoothstep(0.0, 1.0, t * 3.0));
  } else if (t < 2.0 / 3.0) {
    return mix(uMidColor, uHighColor, smoothstep(0.0, 1.0, (t - 1.0 / 3.0) * 3.0));
  } else {
    return mix(uHighColor, uBassColor, smoothstep(0.0, 1.0, (t - 2.0 / 3.0) * 3.0));
  }
}

void main() {
  // Aspect-correct sampling using the actual viewport so the fractal is not
  // distorted on portrait or ultrawide aspect ratios.
  vec2 res = uResolution;
  vec2 uv = (vUv - 0.5) * vec2(max(res.x / res.y, 1.0), max(res.y / res.x, 1.0));
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
    // Interior of the set: a deep tint of the bass color. No black background.
    col = uBassColor * 0.08;
  } else {
    float t = iter / float(MAX_ITER);
    col = paletteRamp(t);
    // Audio-reactive brightness + tiny chromatic-aberration on highs.
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
  const paletteShiftRef = useRef(0);
  const fadeRef = useRef(0);
  const fadePhaseRef = useRef<'idle' | 'out' | 'in'>('idle');
  const { size, viewport } = useThree();

  const maxIter = tier === 'high' ? 192 : tier === 'mid' ? 128 : 72;
  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const fragmentShader = useMemo(() => buildFragmentShader(maxIter), [maxIter]);

  const uniforms = useMemo(
    () => ({
      uResolution: { value: new THREE.Vector2(1, 1) },
      uZoom: { value: 2.0 },
      uPaletteShift: { value: 0 },
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
    // Drift the palette around the ramp slowly, faster on mids. Stays inside
    // the bass/mid/high palette regardless of value.
    let shiftRate = 0.04 + m.mid * 0.18;
    if (reducedMotion) {
      zoomRate = Math.min(zoomRate, 0.08);
      shiftRate /= 3;
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

    paletteShiftRef.current = (paletteShiftRef.current + delta * shiftRate) % 1;

    // Bar-aware brightness flash: spikes at the downbeat, decays in <0.5 beats.
    const barFlash = m.barPhase > 0 ? Math.pow(1 - m.barPhase, 7) : 0;

    mat.uniforms.uResolution!.value.set(size.width, size.height);
    mat.uniforms.uZoom!.value = zoomRef.current;
    mat.uniforms.uPaletteShift!.value = paletteShiftRef.current;
    mat.uniforms.uBassPulse!.value = m.bass + m.beat * 0.35 + barFlash * 0.4;
    mat.uniforms.uHigh!.value = m.high;
    mat.uniforms.uFade!.value = fadeRef.current;
    (mat.uniforms.uBassColor!.value as THREE.Color).set(palette.bass);
    (mat.uniforms.uMidColor!.value as THREE.Color).set(palette.mid);
    (mat.uniforms.uHighColor!.value as THREE.Color).set(palette.high);

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  // Size the plane to cover the full viewport at z=0 so no canvas background
  // ever shows through. `viewport.width/height` give world units at the focal
  // plane; multiply by a safety factor for camera shake / aspect changes.
  const planeW = viewport.width * 1.6;
  const planeH = viewport.height * 1.6;

  return (
    <mesh position={[0, 0, 0]}>
      <planeGeometry args={[planeW, planeH]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}
