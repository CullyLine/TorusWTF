'use client';

/**
 * Halo Rain — fullscreen concentric luminous rings between Star Field dust
 * and Cosmic Mandala geometry. Musical anatomy:
 *  - idle → rings drift downward like celestial rain
 *  - gather → reverse-inhale: drift flips upward and radii tighten to center
 *  - impact → rings flare bright (soft flash, not a strobe)
 *  - hat → sparse ring brightness ticks (distinct from impact flare)
 */

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';

const RINGS_HIGH = 14;
const RINGS_MID = 10;
const RINGS_LOW = 6;

function buildFragmentShader(ringCount: number): string {
  return /* glsl */ `
#define RING_COUNT ${ringCount}

uniform vec2 uResolution;
uniform float uTime;
uniform float uDrift;
uniform float uGather;
uniform float uImpact;
uniform float uHat;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uSwell;
uniform float uAfterglow;
uniform float uEnergy;
uniform float uBarPhase;
uniform float uBgAlpha;
uniform vec3 uColorBass;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;

float hash11(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

// Soft luminous ring profile around a target radius.
float ringLine(float r, float target, float width) {
  float d = abs(r - target);
  return exp(-d * d / max(width * width, 1e-5));
}

vec3 skyWash(vec2 uv, float r) {
  vec3 deep = uColorBass * 0.18;
  vec3 mid = uColorMid * 0.38;
  vec3 rim = mix(uColorHigh, vec3(1.0), 0.12) * 0.5;
  vec3 col = mix(deep, mid, smoothstep(0.0, 0.9, r));
  col = mix(col, rim, smoothstep(0.5, 1.4, r) * 0.5);
  // Gentle vertical rain gradient — darker above, luminous below.
  col *= 0.85 + 0.2 * smoothstep(-1.1, 0.9, uv.y);
  return col;
}

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);

  // Gather reverse-inhale: pull space toward center before the beat.
  float fold = uGather * 0.62;
  float r0 = length(uv) + 1e-4;
  uv *= 1.0 - fold * (0.5 + 0.5 * smoothstep(0.12, 1.15, r0));

  float r = length(uv);
  float ang = atan(uv.y, uv.x);

  // Soft elliptical breathe so rings feel alive, not compass-perfect.
  float oval = 1.0 + sin(ang * 2.0 + uTime * 0.35) * (0.03 + uMid * 0.04);
  r *= oval;

  // Downward rain = positive drift; gather flips sign and slows the fall.
  float rain = uDrift * (1.0 - uGather * 1.35);
  float spacing = 0.115 + uSwell * 0.018;
  float width = 0.012 + uBass * 0.006 + uImpact * 0.01;

  float rings = 0.0;
  float hatTick = 0.0;
  float phase = rain;

  for (int i = 0; i < RING_COUNT; i++) {
    float fi = float(i);
    float seed = hash11(fi * 17.13 + 3.7);
    // Staggered radii scroll through the frame — rain falling past the lens.
    float target = fract(fi * spacing + phase * 0.55 + seed * 0.08) * 1.45;
    float line = ringLine(r, target, width * (0.85 + seed * 0.4));
    // Outer rings slightly thinner so the core owns the frame.
    float weight = mix(1.15, 0.55, smoothstep(0.15, 1.25, target));
    rings += line * weight;

    // Hat ticks sparse rings (every ~3rd) — sparkle without washing the flare.
    float tickSelect = step(0.62, fract(seed * 5.17 + fi * 0.31));
    hatTick += line * tickSelect * weight;
  }

  rings = clamp(rings, 0.0, 2.2);
  hatTick = clamp(hatTick, 0.0, 1.6);

  // Impact flare: brighten + slight radial bloom of the ring field.
  float flare = uImpact * (0.85 + rings * 0.55);
  rings *= 0.7 + uSwell * 0.45 + flare * 0.9 + uEnergy * 0.12;
  rings += flare * 0.35 * exp(-r * r * 2.2);

  vec3 body = skyWash(uv, r);
  body *= 0.55 + uEnergy * 0.22 + uAfterglow * 0.28;

  // Palette ride: bass core → mid body → high outer glitter.
  float tCol = clamp(r * 0.85 + rings * 0.15, 0.0, 1.0);
  vec3 ringCol = mix(uColorBass, uColorMid, smoothstep(0.0, 0.55, tCol));
  ringCol = mix(ringCol, uColorHigh, smoothstep(0.4, 1.1, tCol));
  vec3 warm = mix(uColorBass, vec3(1.0, 0.78, 0.48), 0.5);
  ringCol = mix(ringCol, warm, uAfterglow * 0.4);

  vec3 col = body;
  col += ringCol * rings * (0.55 + flare * 0.55);
  // Hat ticks: cool high-band glitter on selected rings.
  col += mix(uColorHigh, vec3(1.0), 0.25) * hatTick * uHat * 1.15;
  col += warm * uAfterglow * (0.1 + rings * 0.12);

  // Soft downbeat wink — never a hard strobe.
  float barFlash = pow(1.0 - uBarPhase, 9.0) * (0.06 + uImpact * 0.1);
  col += uColorHigh * barFlash;

  float vig = 1.0 - smoothstep(0.8, 1.55, r);
  col *= 0.58 + 0.42 * vig;

  float alpha = mix(0.7 + rings * 0.25 + uAfterglow * 0.1, 1.0, uBgAlpha);
  alpha = clamp(alpha, 0.0, 1.0);
  if (uBgAlpha < 0.5) {
    float edge = smoothstep(1.3, 0.3, r);
    alpha *= 0.32 + edge * 0.68;
    col *= 0.88 + rings * 0.28;
  }

  gl_FragColor = vec4(col, alpha);
}
`;
}

const vertexShader = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

function smoothToward(
  current: number,
  target: number,
  dt: number,
  riseTau: number,
  fallTau: number,
) {
  const tau = target > current ? riseTau : fallTau;
  const k = 1 - Math.exp(-dt / Math.max(tau, 1e-4));
  return current + (target - current) * k;
}

export function HaloRainScene({
  analyser,
  palette,
  tier,
  speed = 1,
  backdrop = false,
}: VisualizerSceneProps) {
  const mods = useModulation();
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();
  const { size } = useThree();
  const timeRef = useRef(0);
  const driftRef = useRef(0);
  const gatherSmooth = useRef(0);
  const impactSmooth = useRef(0);
  const hatSmooth = useRef(0);
  const swellSmooth = useRef(0.15);
  const afterglowSmooth = useRef(0);

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const ringCount = tier === 'high' ? RINGS_HIGH : tier === 'mid' ? RINGS_MID : RINGS_LOW;
  const kitAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const fragmentShader = useMemo(() => buildFragmentShader(ringCount), [ringCount]);

  const uniforms = useMemo(
    () => ({
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uDrift: { value: 0 },
      uGather: { value: 0 },
      uImpact: { value: 0 },
      uHat: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
      uSwell: { value: 0.15 },
      uAfterglow: { value: 0 },
      uEnergy: { value: 0 },
      uBarPhase: { value: 0 },
      uBgAlpha: { value: 1 },
      uColorBass: { value: new THREE.Color(palette.bass) },
      uColorMid: { value: new THREE.Color(palette.mid) },
      uColorHigh: { value: new THREE.Color(palette.high) },
    }),
    // Colors rewritten every frame from the living palette.
    [],
  );

  useFrame((_state, delta) => {
    const mat = matRef.current;
    if (!mat) return;
    const m = metricsRef.current;
    const dt = Math.min(delta, 0.1);
    const pace = Math.max(0.05, mods.current.speed ?? speed);
    const calm = reducedMotion ? 0.35 : 1;
    const sectionPace = 0.75 + m.sectionLevel * 0.45;

    timeRef.current +=
      dt * pace * sectionPace * calm * (0.5 + m.swell * 0.65 + m.impact * 0.2);

    gatherSmooth.current = smoothToward(gatherSmooth.current, m.gather, dt, 0.04, 0.14);
    swellSmooth.current = smoothToward(swellSmooth.current, m.swell, dt, 0.12, 0.45);
    impactSmooth.current = smoothToward(
      impactSmooth.current,
      Math.min(1.2, m.impact * 0.95 + m.release * 0.15) * kitAmp,
      dt,
      0.03,
      0.16,
    );
    hatSmooth.current = smoothToward(
      hatSmooth.current,
      Math.min(1.2, m.hat * 0.95 + m.shimmer * 0.25) * kitAmp,
      dt,
      0.025,
      0.1,
    );
    afterglowSmooth.current = smoothToward(afterglowSmooth.current, m.afterglow, dt, 0.18, 0.8);

    // Rain velocity: steady fall, bass thickens the pace, gather reverses.
    const fallSpeed =
      (0.55 + swellSmooth.current * 0.85 + m.bass * 0.35 + m.energy * 0.2) *
      pace *
      sectionPace *
      calm;
    driftRef.current += dt * fallSpeed;

    mat.uniforms.uResolution!.value.set(size.width, size.height);
    mat.uniforms.uTime!.value = timeRef.current;
    mat.uniforms.uDrift!.value = driftRef.current;
    mat.uniforms.uGather!.value = gatherSmooth.current;
    mat.uniforms.uImpact!.value = impactSmooth.current;
    mat.uniforms.uHat!.value = hatSmooth.current;
    mat.uniforms.uBass!.value = m.bass;
    mat.uniforms.uMid!.value = m.mid;
    mat.uniforms.uHigh!.value = m.high;
    mat.uniforms.uSwell!.value = swellSmooth.current;
    mat.uniforms.uAfterglow!.value = afterglowSmooth.current;
    mat.uniforms.uEnergy!.value = m.energy + afterglowSmooth.current * 0.25;
    mat.uniforms.uBarPhase!.value = m.barPhase;
    mat.uniforms.uBgAlpha!.value = backdrop ? 0 : 1;
    (mat.uniforms.uColorBass!.value as THREE.Color).set(palette.bass);
    (mat.uniforms.uColorMid!.value as THREE.Color).set(palette.mid);
    (mat.uniforms.uColorHigh!.value as THREE.Color).set(palette.high);

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  return (
    <mesh frustumCulled={false} renderOrder={1}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3]}
          count={3}
          itemSize={3}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}
