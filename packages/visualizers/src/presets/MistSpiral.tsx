'use client';

/**
 * Mist Spiral — fullscreen rising mist coils between Ember Drift ash and
 * Tide Veil caustics. Musical anatomy:
 *  - idle / swell → soft coils spiral upward around a vertical axis
 *  - gather → inhale toward center before the beat
 *  - impact → soft flare (brightness + coil bloom), not a strobe
 *  - hat → sparse mote glitter on selected coils
 */

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';

const COILS_HIGH = 6;
const COILS_MID = 4;
const COILS_LOW = 3;

const OCTAVES_HIGH = 5;
const OCTAVES_MID = 4;
const OCTAVES_LOW = 3;

function buildFragmentShader(coilCount: number, mistOctaves: number): string {
  return /* glsl */ `
#define COIL_COUNT ${coilCount}
#define MIST_OCTAVES ${mistOctaves}

uniform vec2 uResolution;
uniform float uTime;
uniform float uRise;
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

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < MIST_OCTAVES; i++) {
    v += a * vnoise(p);
    p = p * 2.05 + vec2(1.4, 8.7);
    a *= 0.52;
  }
  return v;
}

// Soft ribbon along a spiral arm in polar space.
float coilLine(float ang, float target, float width) {
  float d = abs(atan(sin(ang - target), cos(ang - target)));
  return exp(-d * d / max(width * width, 1e-5));
}

vec3 mistWash(vec2 uv, float r) {
  // Cool silver-mist body — softer / cooler than Ember Drift ash.
  vec3 deep = mix(uColorBass, vec3(0.35, 0.48, 0.58), 0.45) * 0.22;
  vec3 mid = mix(uColorMid, vec3(0.62, 0.74, 0.82), 0.35) * 0.42;
  vec3 rim = mix(uColorHigh, vec3(0.88, 0.94, 1.0), 0.28) * 0.52;
  vec3 col = mix(deep, mid, smoothstep(0.0, 0.85, r));
  col = mix(col, rim, smoothstep(0.5, 1.35, r) * 0.5);
  // Vertical loft: denser mist near the hearth, thinner aloft.
  col *= 0.82 + 0.22 * smoothstep(-1.15, 0.95, uv.y);
  return col;
}

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);

  // Gather inhale: coils pull toward the vertical axis.
  float fold = uGather * 0.6;
  float r0 = length(uv) + 1e-4;
  uv *= 1.0 - fold * (0.5 + 0.5 * smoothstep(0.12, 1.15, r0));
  // Soft vertical settle so the column listens before the beat.
  uv.y += (0.0 - uv.y) * fold * 0.28;

  float r = length(uv);
  float ang = atan(uv.y, uv.x);

  // Soft elliptical breathe — living mist, not a hard helix.
  float oval = 1.0 + sin(ang * 2.0 + uTime * 0.32) * (0.028 + uMid * 0.035);
  r *= oval;

  float rise = uRise * (1.0 - uGather * 0.85);
  float width = 0.14 + uBass * 0.04 + uImpact * 0.05;
  float pitch = 1.55 + uSwell * 0.35;

  float coils = 0.0;
  float moteTick = 0.0;

  for (int i = 0; i < COIL_COUNT; i++) {
    float fi = float(i);
    float seed = fract(sin(fi * 17.13 + 3.7) * 43758.5453);
    // Spiral around vertical axis: angle tracks height + continuous rise.
    float target = fi * (6.2831853 / float(COIL_COUNT))
      + uv.y * pitch
      + rise * (1.15 + seed * 0.35)
      + seed * 0.4;
    float line = coilLine(ang, target, width * (0.75 + seed * 0.45));
    // Outer mist thinner so the axis owns the frame.
    float weight = mix(1.2, 0.45, smoothstep(0.1, 1.2, r));
    // Soft radial falloff keeps coils readable as a column.
    float radial = exp(-r * r * (1.1 - uSwell * 0.25));
    coils += line * weight * radial;

    // Hat motes: sparse glitter on every ~3rd coil sample.
    float tickSelect = step(0.62, fract(seed * 5.17 + fi * 0.31));
    moteTick += line * tickSelect * weight * radial;
  }

  // Mist body from FBM — soft vapor between the coils.
  vec2 mistUv = uv * (1.6 + uSwell * 0.35);
  mistUv.y += rise * 0.55;
  mistUv += (fbm(mistUv * 1.4 + uTime * 0.12) - 0.5) * (0.18 + uSwell * 0.2);
  float mist = fbm(mistUv);
  mist = smoothstep(0.28, 0.82, mist) * (0.45 + uSwell * 0.4 + uEnergy * 0.15);

  coils = clamp(coils, 0.0, 2.2);
  moteTick = clamp(moteTick, 0.0, 1.6);

  // Impact flare: brighten coils + soft core bloom.
  float flare = uImpact * (0.85 + coils * 0.5);
  coils *= 0.68 + uSwell * 0.48 + flare * 0.9 + uEnergy * 0.12;
  coils += flare * 0.32 * exp(-r * r * 2.4);
  mist *= 0.75 + uSwell * 0.35 + flare * 0.45;

  vec3 body = mistWash(uv, r);
  body *= 0.52 + uEnergy * 0.22 + uAfterglow * 0.28 + mist * 0.35;

  // Cool mist palette: bass core → mid vapor → high silver rim.
  float tCol = clamp(r * 0.8 + coils * 0.18, 0.0, 1.0);
  vec3 coilCol = mix(uColorBass, uColorMid, smoothstep(0.0, 0.55, tCol));
  coilCol = mix(coilCol, uColorHigh, smoothstep(0.4, 1.1, tCol));
  vec3 silver = mix(uColorMid, vec3(0.78, 0.88, 0.96), 0.55);
  coilCol = mix(coilCol, silver, 0.28 + uAfterglow * 0.25);

  vec3 col = body;
  col += coilCol * coils * (0.52 + flare * 0.55);
  col += silver * mist * (0.22 + uAfterglow * 0.18);
  // Hat mote glitter — cool high-band sparkle on selected coils.
  col += mix(uColorHigh, vec3(1.0), 0.3) * moteTick * uHat * 1.2;
  col += silver * uAfterglow * (0.08 + coils * 0.1);

  float barFlash = pow(1.0 - uBarPhase, 9.0) * (0.05 + uImpact * 0.1);
  col += uColorHigh * barFlash;

  float vig = 1.0 - smoothstep(0.78, 1.55, r);
  col *= 0.56 + 0.44 * vig;

  float alpha = mix(0.68 + coils * 0.22 + mist * 0.18 + uAfterglow * 0.1, 1.0, uBgAlpha);
  alpha = clamp(alpha, 0.0, 1.0);
  if (uBgAlpha < 0.5) {
    float edge = smoothstep(1.3, 0.28, r);
    alpha *= 0.3 + edge * 0.7;
    col *= 0.86 + coils * 0.28 + mist * 0.12;
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

export function MistSpiralScene({
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
  const riseRef = useRef(0);
  const gatherSmooth = useRef(0);
  const impactSmooth = useRef(0);
  const hatSmooth = useRef(0);
  const swellSmooth = useRef(0.15);
  const afterglowSmooth = useRef(0);

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const coilCount = tier === 'high' ? COILS_HIGH : tier === 'mid' ? COILS_MID : COILS_LOW;
  const mistOctaves =
    tier === 'high' ? OCTAVES_HIGH : tier === 'mid' ? OCTAVES_MID : OCTAVES_LOW;
  const kitAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const fragmentShader = useMemo(
    () => buildFragmentShader(coilCount, mistOctaves),
    [coilCount, mistOctaves],
  );

  const uniforms = useMemo(
    () => ({
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uRise: { value: 0 },
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

    // Rise velocity: mist climbs the column; gather slows the loft.
    const riseSpeed =
      (0.48 + swellSmooth.current * 0.9 + m.bass * 0.3 + m.energy * 0.22) *
      pace *
      sectionPace *
      calm;
    riseRef.current += dt * riseSpeed;

    mat.uniforms.uResolution!.value.set(size.width, size.height);
    mat.uniforms.uTime!.value = timeRef.current;
    mat.uniforms.uRise!.value = riseRef.current;
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
