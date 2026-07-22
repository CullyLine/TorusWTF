'use client';

/**
 * Night Bloom — radial soft-light petals between Cosmic Mandala geometry and
 * Ember Drift ash. Musical anatomy:
 *  - idle / swell → petals open outward, luminous field breathes
 *  - gather → inhale toward center before the beat
 *  - impact → soft flare (petal bloom + core glow), not a strobe
 *  - hat → sparse mote glitter on petal tips
 */

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';

const PETALS_HIGH = 8;
const PETALS_MID = 6;
const PETALS_LOW = 4;

const LAYERS_HIGH = 4;
const LAYERS_MID = 3;
const LAYERS_LOW = 2;

function buildFragmentShader(petalCount: number, layerCount: number): string {
  return /* glsl */ `
#define PETAL_COUNT ${petalCount}
#define LAYER_COUNT ${layerCount}

uniform vec2 uResolution;
uniform float uTime;
uniform float uOpen;
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

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

// Soft petal lobe: wider when open, firmer when closed.
float petalLobe(float ang, float openAmt) {
  float lobe = abs(cos(ang * float(PETAL_COUNT) * 0.5));
  float sharp = mix(2.65, 1.25, openAmt);
  return pow(max(lobe, 1e-4), sharp);
}

// Soft ribbon along a radial petal curve.
float petalRibbon(float r, float target, float width) {
  float d = abs(r - target);
  return exp(-d * d / max(width * width, 1e-5));
}

vec3 bloomWash(float r, float openAmt) {
  // Dusk floral body — warmer than mandala, softer than ember ash.
  vec3 deep = mix(uColorBass, vec3(0.42, 0.22, 0.38), 0.42) * 0.2;
  vec3 mid = mix(uColorMid, vec3(0.78, 0.48, 0.62), 0.38) * 0.4;
  vec3 rim = mix(uColorHigh, vec3(1.0, 0.86, 0.72), 0.32) * 0.55;
  vec3 col = mix(deep, mid, smoothstep(0.0, 0.75, r));
  col = mix(col, rim, smoothstep(0.45, 1.25, r) * (0.35 + openAmt * 0.35));
  return col;
}

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);

  // Gather inhale: petals fold toward the bloom center.
  float fold = uGather * 0.62;
  float r0 = length(uv) + 1e-4;
  uv *= 1.0 - fold * (0.48 + 0.52 * smoothstep(0.1, 1.2, r0));

  float r = length(uv);
  float ang = atan(uv.y, uv.x);

  // Living oval breathe — petals never sit on a perfect circle.
  float oval = 1.0 + sin(ang * 2.0 + uTime * 0.28) * (0.03 + uMid * 0.04);
  r *= oval;

  float openAmt = clamp(uOpen, 0.0, 1.35);
  float width = 0.055 + uBass * 0.02 + uImpact * 0.035 + openAmt * 0.018;
  float spin = uTime * (0.12 + uSwell * 0.08) * (1.0 - uGather * 0.75);

  float petals = 0.0;
  float tipMotes = 0.0;
  float coreGlow = 0.0;

  for (int i = 0; i < LAYER_COUNT; i++) {
    float fi = float(i);
    float seed = fract(sin(fi * 19.17 + 2.4) * 43758.5453);
    // Outer layers open more on swell; gather keeps them close.
    float layerOpen = openAmt * (0.72 + seed * 0.35) * (1.0 - uGather * 0.55);
    float baseR = (0.22 + fi * 0.2) * (0.55 + layerOpen * 0.7);
    float angShift = ang + spin * (0.55 + seed * 0.45) + fi * 0.22;
    float lobe = petalLobe(angShift, clamp(layerOpen, 0.0, 1.0));
    float target = baseR * (0.38 + 0.62 * lobe);
    float line = petalRibbon(r, target, width * (0.8 + seed * 0.4));
    // Soft radial falloff so the center owns the frame.
    float radial = exp(-r * r * (1.05 - openAmt * 0.22));
    float weight = mix(1.15, 0.5, smoothstep(0.08, 1.2, r));
    petals += line * weight * radial;

    // Hat motes: sparse glitter near petal tips (outer lobes).
    float tipMask = smoothstep(0.55, 0.95, lobe) * smoothstep(0.15, 0.55, r);
    float tickSelect = step(0.58, fract(seed * 5.17 + fi * 0.31));
    tipMotes += line * tipMask * tickSelect * weight;

    // Soft inner glow per layer.
    coreGlow += exp(-r * r * (4.5 - layerOpen * 1.2)) * (0.35 + fi * 0.08);
  }

  // Soft vapor fill between petals — ash-like luminous field.
  vec2 mistUv = uv * (1.5 + openAmt * 0.4);
  mistUv += (vnoise(mistUv * 1.3 + uTime * 0.1) - 0.5) * (0.16 + openAmt * 0.18);
  float field = vnoise(mistUv);
  field = smoothstep(0.3, 0.8, field) * (0.28 + openAmt * 0.42 + uEnergy * 0.12);
  field *= exp(-r * r * 0.85);

  petals = clamp(petals, 0.0, 2.4);
  tipMotes = clamp(tipMotes, 0.0, 1.6);
  coreGlow = clamp(coreGlow, 0.0, 1.8);

  // Impact flare: petal bloom + soft core flash.
  float flare = uImpact * (0.9 + petals * 0.45);
  petals *= 0.65 + openAmt * 0.5 + flare * 0.85 + uEnergy * 0.12;
  petals += flare * 0.28 * exp(-r * r * 2.2);
  field *= 0.72 + openAmt * 0.38 + flare * 0.4;
  coreGlow *= 0.8 + flare * 0.9 + uAfterglow * 0.25;

  vec3 body = bloomWash(r, openAmt);
  body *= 0.48 + uEnergy * 0.22 + uAfterglow * 0.3 + field * 0.4;

  // Petal palette: deep rose core → warm mid → soft gold high rim.
  float tCol = clamp(r * 0.75 + petals * 0.16, 0.0, 1.0);
  vec3 petalCol = mix(uColorBass, uColorMid, smoothstep(0.0, 0.55, tCol));
  petalCol = mix(petalCol, uColorHigh, smoothstep(0.35, 1.05, tCol));
  vec3 duskRose = mix(uColorMid, vec3(0.95, 0.62, 0.72), 0.5);
  vec3 tipGold = mix(uColorHigh, vec3(1.0, 0.88, 0.7), 0.45);
  petalCol = mix(petalCol, duskRose, 0.28 + uAfterglow * 0.22);

  vec3 col = body;
  col += petalCol * petals * (0.55 + flare * 0.5);
  col += tipGold * field * (0.2 + uAfterglow * 0.16);
  col += duskRose * coreGlow * (0.18 + flare * 0.22);
  // Hat mote glitter — warm high-band sparkle on petal tips.
  col += mix(uColorHigh, tipGold, 0.45) * tipMotes * uHat * 1.25;
  col += tipGold * uAfterglow * (0.07 + petals * 0.09);

  float barFlash = pow(1.0 - uBarPhase, 9.0) * (0.05 + uImpact * 0.1);
  col += tipGold * barFlash;

  float vig = 1.0 - smoothstep(0.75, 1.5, r);
  col *= 0.55 + 0.45 * vig;

  float alpha = mix(0.7 + petals * 0.2 + field * 0.16 + uAfterglow * 0.1, 1.0, uBgAlpha);
  alpha = clamp(alpha, 0.0, 1.0);
  if (uBgAlpha < 0.5) {
    float edge = smoothstep(1.28, 0.26, r);
    alpha *= 0.3 + edge * 0.7;
    col *= 0.86 + petals * 0.28 + field * 0.12;
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

export function NightBloomScene({
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
  const openSmooth = useRef(0.2);
  const gatherSmooth = useRef(0);
  const impactSmooth = useRef(0);
  const hatSmooth = useRef(0);
  const swellSmooth = useRef(0.15);
  const afterglowSmooth = useRef(0);

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const petalCount = tier === 'high' ? PETALS_HIGH : tier === 'mid' ? PETALS_MID : PETALS_LOW;
  const layerCount =
    tier === 'high' ? LAYERS_HIGH : tier === 'mid' ? LAYERS_MID : LAYERS_LOW;
  const kitAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const fragmentShader = useMemo(
    () => buildFragmentShader(petalCount, layerCount),
    [petalCount, layerCount],
  );

  const uniforms = useMemo(
    () => ({
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uOpen: { value: 0.2 },
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

    // Petal open: swell + energy open the bloom; gather keeps a floor so it never snaps shut.
    const openTarget =
      0.18 +
      swellSmooth.current * 0.78 +
      m.energy * 0.22 +
      m.bass * 0.1 +
      afterglowSmooth.current * 0.12;
    openSmooth.current = smoothToward(openSmooth.current, openTarget, dt, 0.1, 0.35);

    mat.uniforms.uResolution!.value.set(size.width, size.height);
    mat.uniforms.uTime!.value = timeRef.current;
    mat.uniforms.uOpen!.value = openSmooth.current;
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
