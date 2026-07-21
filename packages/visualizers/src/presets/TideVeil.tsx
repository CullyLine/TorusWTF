'use client';

/**
 * Tide Veil — soft fullscreen caustic sheet between Liquid Blob goo and
 * Chrome metal. Musical anatomy:
 *  - swell → veil rolls / wave amplitude grows through choruses
 *  - gather → UV folds inward (pre-beat crease) before the hit
 *  - impact → caustic ridges flash bright
 *  - afterglow → warm residual light holds after peaks
 *  - holdBreath / deep silence → nearly still the caustic roll + ease ridge contrast
 *  - tenderness → soften caustic sharpness so gentle vocals read as a softer sheet
 */

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';

const OCTAVES_HIGH = 5;
const OCTAVES_MID = 4;
const OCTAVES_LOW = 3;

function buildFragmentShader(octaves: number): string {
  return /* glsl */ `
#define CAUSTIC_OCTAVES ${octaves}

uniform vec2 uResolution;
uniform float uTime;
uniform float uSwell;
uniform float uGather;
uniform float uImpact;
uniform float uAfterglow;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uShimmer;
uniform float uEnergy;
uniform float uBarPhase;
uniform float uBgAlpha;
uniform float uStillness;
uniform float uTenderness;
uniform vec3 uColorBass;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Soft value noise — caustic warp driver.
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
  for (int i = 0; i < CAUSTIC_OCTAVES; i++) {
    v += a * vnoise(p);
    p = p * 2.07 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

// Classic water-caustic interference: bright ridges where wave phases align.
// soft (0-1 from tenderness) widens ridge falloff so gentle vocals hush the bite.
float causticField(vec2 uv, float t, float soft) {
  float c = 0.0;
  float amp = 1.0;
  float freq = 1.0;
  // Sharper pow = harder caustic focus; tender passages ease toward a softer sheet.
  float ridgePow = mix(2.4, 1.35, soft);
  float ridgeWidth = mix(1.35, 1.75, soft);
  for (int i = 0; i < CAUSTIC_OCTAVES; i++) {
    vec2 q = uv * (2.4 + float(i) * 0.85) * freq;
    // Domain warp so the veil feels liquid, not grid-locked.
    q += 0.35 * vec2(
      sin(q.y * 1.7 + t * (0.55 + float(i) * 0.11)),
      cos(q.x * 1.5 - t * (0.48 + float(i) * 0.09))
    );
    float a = sin(q.x + t * 0.7) + sin(q.y * 1.3 - t * 0.55);
    float b = sin(q.x * 1.4 - q.y + t * 0.4) + cos(q.y * 1.1 + t * 0.62);
    float cell = abs(a * b);
    // Ridges = light focus; soft falloff keeps mid/low tiers from strobing.
    c += amp * pow(1.0 - smoothstep(0.0, ridgeWidth, cell), ridgePow);
    amp *= 0.62;
    freq *= 1.35;
  }
  return clamp(c, 0.0, 1.6);
}

vec3 veilBackground(vec2 uv) {
  float r = length(uv);
  vec3 deep = uColorBass * 0.22;
  vec3 mid = uColorMid * 0.45;
  vec3 rim = mix(uColorHigh, vec3(1.0), 0.15) * 0.55;
  vec3 col = mix(deep, mid, smoothstep(0.0, 0.85, r));
  col = mix(col, rim, smoothstep(0.55, 1.35, r) * 0.55);
  return col;
}

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);

  // Gather folds the sheet toward center — anticipation crease.
  float fold = uGather * 0.55;
  float r0 = length(uv) + 1e-4;
  uv *= 1.0 - fold * (0.55 + 0.45 * smoothstep(0.15, 1.1, r0));
  // Slight angular squeeze so the fold reads as a living membrane.
  float ang = atan(uv.y, uv.x);
  ang += sin(ang * 3.0 + uTime * 0.4) * fold * 0.22;
  float rr = length(uv);
  uv = vec2(cos(ang), sin(ang)) * rr;

  // Swell rolls the veil: scroll + wave amplitude.
  // holdBreath gates uTime advance in JS so the roll nearly freezes while listening.
  float roll = 0.35 + uSwell * 1.15 + uBass * 0.35;
  float t = uTime * (0.22 + uSwell * 0.35 + uEnergy * 0.12);
  vec2 flow = uv * (1.15 + uSwell * 0.35);
  flow.x += t * 0.18 * roll;
  flow.y += sin(uv.x * 2.4 + t * 0.7) * (0.08 + uSwell * 0.14);
  flow += (fbm(flow * 1.6 + t * 0.15) - 0.5) * (0.22 + uSwell * 0.28);

  float caust = causticField(flow, t, uTenderness);
  // Impact flashes the ridges; shimmer adds fine glitter on hats.
  float flash = uImpact * 1.15 + uShimmer * 0.35;
  caust *= 0.55 + uSwell * 0.55 + flash * 0.85 + uMid * 0.25;
  // Quiet hush eases ridge contrast without killing gather fold / impact flash paths.
  caust *= mix(1.0, 0.58, uStillness);

  // Soft body veil under the caustics.
  vec3 body = veilBackground(uv);
  body *= 0.55 + uEnergy * 0.25 + uAfterglow * 0.35;

  // Caustic light: palette mid→high with a warm afterglow tint.
  vec3 caustCol = mix(uColorMid, uColorHigh, clamp(caust * 0.65, 0.0, 1.0));
  vec3 warm = mix(uColorBass, vec3(1.0, 0.72, 0.42), 0.55);
  caustCol = mix(caustCol, warm, uAfterglow * 0.55);

  vec3 col = body;
  col += caustCol * caust * (0.55 + flash * 0.7);
  // Secondary soft bloom of residual warmth after peaks.
  col += warm * uAfterglow * (0.12 + caust * 0.18);
  // Downbeat wink — subtle, not a strobe.
  float barFlash = pow(1.0 - uBarPhase, 8.0) * (0.08 + uImpact * 0.12);
  col += uColorHigh * barFlash;

  // Soft vignette so the veil owns the frame without hard edges.
  float vig = 1.0 - smoothstep(0.75, 1.55, length(uv));
  col *= 0.55 + 0.45 * vig;

  // With a BackgroundLayer sky, keep edges soft-transparent so the veil
  // reads as a sheet IN the environment rather than an opaque quad.
  float alpha = mix(0.72 + caust * 0.28 + uAfterglow * 0.12, 1.0, uBgAlpha);
  alpha = clamp(alpha, 0.0, 1.0);
  if (uBgAlpha < 0.5) {
    // Additive-leaning composite: miss/dim regions let the sky through.
    float edge = smoothstep(1.25, 0.35, length(uv));
    alpha *= 0.35 + edge * 0.65;
    col *= 0.85 + caust * 0.35;
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

function smoothToward(current: number, target: number, dt: number, riseTau: number, fallTau: number) {
  const tau = target > current ? riseTau : fallTau;
  const k = 1 - Math.exp(-dt / Math.max(tau, 1e-4));
  return current + (target - current) * k;
}

export function TideVeilScene({
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
  const gatherSmooth = useRef(0);
  const swellSmooth = useRef(0.15);
  const impactSmooth = useRef(0);
  const afterglowSmooth = useRef(0);
  const stillnessSmooth = useRef(0);
  const tenderSmooth = useRef(0);

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const octaves = tier === 'high' ? OCTAVES_HIGH : tier === 'mid' ? OCTAVES_MID : OCTAVES_LOW;
  // Low tier still gets the full musical envelope — just fewer caustic layers.
  const flashAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const fragmentShader = useMemo(() => buildFragmentShader(octaves), [octaves]);

  const uniforms = useMemo(
    () => ({
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uSwell: { value: 0.15 },
      uGather: { value: 0 },
      uImpact: { value: 0 },
      uAfterglow: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
      uShimmer: { value: 0 },
      uEnergy: { value: 0 },
      uBarPhase: { value: 0 },
      uBgAlpha: { value: 1 },
      uStillness: { value: 0 },
      uTenderness: { value: 0 },
      uColorBass: { value: new THREE.Color(palette.bass) },
      uColorMid: { value: new THREE.Color(palette.mid) },
      uColorHigh: { value: new THREE.Color(palette.high) },
    }),
    // Colors are rewritten every frame from the living palette.
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

    // Hold-breath stillness: the veil listens instead of rolling through quiet.
    const stillnessTarget = Math.min(
      1,
      Math.max(m.holdBreath, m.silence * 0.92) + Math.min(m.holdBreath, m.silence) * 0.15,
    );
    stillnessSmooth.current = smoothToward(
      stillnessSmooth.current,
      stillnessTarget,
      dt,
      0.14,
      0.08,
    );
    const stillness = stillnessSmooth.current;
    // Nearly freeze the caustic clock; a whisper remains so thaw never pops.
    const motionMul = 1 - stillness * 0.92;

    tenderSmooth.current = smoothToward(
      tenderSmooth.current,
      Math.min(1, m.tenderness),
      dt,
      0.12,
      0.22,
    );

    timeRef.current +=
      dt *
      pace *
      sectionPace *
      calm *
      motionMul *
      (0.55 + m.swell * 0.7 + m.impact * 0.25);

    // Gather / impact / afterglow stay on full dt so kit replies still fire on thaw.
    gatherSmooth.current = smoothToward(gatherSmooth.current, m.gather, dt, 0.04, 0.14);
    swellSmooth.current = smoothToward(swellSmooth.current, m.swell, dt, 0.12, 0.45);
    impactSmooth.current = smoothToward(
      impactSmooth.current,
      Math.min(1.2, m.impact * 0.95 + m.release * 0.2) * flashAmp,
      dt,
      0.03,
      0.16,
    );
    afterglowSmooth.current = smoothToward(
      afterglowSmooth.current,
      m.afterglow,
      dt,
      0.18,
      0.8,
    );

    mat.uniforms.uResolution!.value.set(size.width, size.height);
    mat.uniforms.uTime!.value = timeRef.current;
    mat.uniforms.uSwell!.value = swellSmooth.current;
    mat.uniforms.uGather!.value = gatherSmooth.current;
    mat.uniforms.uImpact!.value = impactSmooth.current;
    mat.uniforms.uAfterglow!.value = afterglowSmooth.current;
    mat.uniforms.uBass!.value = m.bass;
    mat.uniforms.uMid!.value = m.mid;
    mat.uniforms.uHigh!.value = m.high;
    mat.uniforms.uShimmer!.value = m.shimmer * flashAmp;
    mat.uniforms.uEnergy!.value = m.energy + afterglowSmooth.current * 0.25;
    mat.uniforms.uBarPhase!.value = m.barPhase;
    mat.uniforms.uBgAlpha!.value = backdrop ? 0 : 1;
    mat.uniforms.uStillness!.value = stillness;
    mat.uniforms.uTenderness!.value = tenderSmooth.current;
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
