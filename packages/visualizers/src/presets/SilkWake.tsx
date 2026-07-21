'use client';

/**
 * Silk Wake — fullscreen braided light ribbons between Flow Field particles
 * and Tide Veil caustics. Musical anatomy:
 *  - gather → ribbons fold / braid inward (pre-beat inhale)
 *  - impact / release → flare and unfurl outward
 *  - afterglow → warm residual trails linger after peaks
 *  - swell → braid amplitude and flow pace grow through choruses
 *  - kick → thrust along the braid (flow surge + core punch)
 *  - snare → lateral shear flash (phase-split L/R crack)
 *  - hat → sparse mote ticks on braid edges (distinct from shimmer)
 */

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';

const RIBBONS_HIGH = 7;
const RIBBONS_MID = 5;
const RIBBONS_LOW = 3;

function buildFragmentShader(ribbonCount: number): string {
  return /* glsl */ `
#define RIBBON_COUNT ${ribbonCount}

uniform vec2 uResolution;
uniform float uTime;
uniform float uSwell;
uniform float uGather;
uniform float uImpact;
uniform float uAfterglow;
uniform float uKick;
uniform float uSnare;
uniform float uHat;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uShimmer;
uniform float uEnergy;
uniform float uBarPhase;
uniform float uBgAlpha;
uniform vec3 uColorBass;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;

float hash11(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

// Soft distance to a flowing silk strand: a sine-braided horizontal curve
// with per-ribbon phase, vertical weave, and thickness that breathes.
float ribbonDist(vec2 uv, float id, float t, float fold, float flare) {
  float phase = id * 1.6180339887;
  float seed = hash11(id + 0.37);
  float y0 = (seed - 0.5) * 1.55;
  float weave = 0.18 + uSwell * 0.22 + uMid * 0.12;
  // Gather pulls strands toward the horizontal mid-line; impact unfurls.
  float braidAmp = weave * (1.0 - fold * 0.72) * (1.0 + flare * 0.85);
  // Kick thrusts flow along the braid (local surge, not a fullscreen wash).
  float kick = clamp(uKick, 0.0, 1.2);
  float flow = t * (0.35 + seed * 0.25 + uBass * 0.15 + kick * 0.55) + phase
    + kick * (0.55 + seed * 0.35);
  float pathY = y0 * (1.0 - fold * 0.85)
    + sin(uv.x * (2.1 + seed * 1.4) + flow) * braidAmp
    + sin(uv.x * (4.6 + seed * 2.0) - flow * 1.35 + phase) * braidAmp * 0.42;
  // Soft lateral sway so the braid feels alive, not a flat curtain.
  pathY += cos(uv.x * 1.1 + t * 0.55 + phase) * (0.04 + uHigh * 0.06) * (1.0 - fold * 0.5);
  // Snare lateral shear: phase-split L/R crack across the braid.
  float snare = clamp(uSnare, 0.0, 1.2);
  float lateral = sign(sin(phase * 6.2831853 + seed * 12.0));
  if (abs(lateral) < 0.01) lateral = 1.0;
  pathY += snare * lateral * (0.055 + seed * 0.03) * (1.0 - fold * 0.35);

  float halfW = (0.028 + uEnergy * 0.012 + flare * 0.035 + kick * 0.022)
    * (1.0 + fold * 0.55) // thicker when gathered (silk bunching)
    * (1.0 - flare * 0.15);
  float d = abs(uv.y - pathY) / max(halfW, 1e-4);
  return d;
}

vec3 silkBackdrop(vec2 uv) {
  float r = length(uv);
  vec3 deep = uColorBass * 0.18;
  vec3 mid = uColorMid * 0.32;
  vec3 rim = mix(uColorHigh, vec3(1.0), 0.12) * 0.4;
  vec3 col = mix(deep, mid, smoothstep(0.0, 0.9, r));
  col = mix(col, rim, smoothstep(0.5, 1.4, r) * 0.45);
  return col;
}

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);

  float fold = uGather;
  float flare = uImpact;
  float kick = clamp(uKick, 0.0, 1.2);
  float snare = clamp(uSnare, 0.0, 1.2);
  float hat = clamp(uHat, 0.0, 1.2);

  // Gather folds the frame inward; impact stretches it back open.
  // Kick adds a brief along-braid zoom punch (local, not a sky wash).
  float zoom = 1.0 - fold * 0.28 + flare * 0.18 + kick * 0.06;
  uv *= zoom;

  // Mild radial squeeze on gather so ribbons braid into a silk knot.
  float r0 = length(uv) + 1e-4;
  float ang = atan(uv.y, uv.x);
  ang += sin(ang * 2.0 + uTime * 0.5) * fold * 0.18;
  uv = vec2(cos(ang), sin(ang)) * r0 * (1.0 - fold * 0.12 * smoothstep(0.1, 1.0, r0));
  // Snare shears the whole braid sheet laterally before distance sampling.
  uv.x += snare * 0.045 * sign(uv.x + 1e-4);

  float t = uTime * (0.55 + uSwell * 0.55 + uEnergy * 0.2 + kick * 0.35);
  vec3 body = silkBackdrop(uv);
  body *= 0.5 + uEnergy * 0.22 + uAfterglow * 0.4;

  float glow = 0.0;
  float trail = 0.0;
  float mote = 0.0;
  vec3 ribbonCol = vec3(0.0);

  for (int i = 0; i < RIBBON_COUNT; i++) {
    float id = float(i);
    float d = ribbonDist(uv, id, t, fold, flare);
    // Core strand + soft halo.
    float core = exp(-d * d * 1.85);
    float halo = exp(-d * d * 0.35) * 0.45;
    float strand = core + halo;

    // Afterglow leaves warm residual trails beside each ribbon.
    float wake = exp(-d * d * 0.12) * uAfterglow * (0.35 + 0.25 * sin(uv.x * 3.0 + t + id));
    trail += wake;

    // Hat mote ticks: sparse edge sparkles (every ~3rd ribbon), not continuous shimmer.
    float seed = hash11(id + 0.37);
    float tickSelect = step(0.58, fract(seed * 5.17 + id * 0.31));
    float edge = exp(-pow(abs(d - 1.15), 2.0) * 6.0);
    mote += edge * tickSelect * strand;

    float mixT = fract(id * 0.27 + uMid * 0.15 + uBarPhase * 0.08);
    vec3 c = mix(uColorBass, uColorMid, smoothstep(0.0, 0.55, mixT));
    c = mix(c, uColorHigh, smoothstep(0.45, 1.0, mixT));
    // Impact flares toward white-hot silk; afterglow warms toward amber.
    vec3 warm = mix(uColorBass, vec3(1.0, 0.78, 0.48), 0.55);
    c = mix(c, vec3(1.0), flare * 0.35 * core);
    c = mix(c, warm, uAfterglow * 0.45);
    // Kick punches bass-warm core; snare cracks toward mid/white flash.
    c = mix(c, mix(uColorBass, vec3(1.0, 0.85, 0.7), 0.35), kick * 0.4 * core);
    c = mix(c, mix(uColorMid, vec3(1.0), 0.55), snare * 0.45 * core);

    ribbonCol += c * strand;
    glow += strand;
  }

  // Normalize so more ribbons on high tier stay luminous without washing out.
  float norm = max(float(RIBBON_COUNT) * 0.55, 1.0);
  ribbonCol /= norm;
  glow /= norm;
  trail /= norm;
  mote /= norm;

  // Shimmer melts fine glitter along the braid edges (sustained sparkle).
  float glitter = pow(max(glow, 0.0), 3.0) * uShimmer * 0.85;
  ribbonCol += mix(uColorHigh, vec3(1.0), 0.4) * glitter;
  // Hat motes: crisp tick-tick on selected ribbon edges.
  ribbonCol += mix(uColorHigh, vec3(1.0), 0.35) * mote * hat * 1.25;

  vec3 col = body;
  col += ribbonCol * (0.95 + flare * 0.85 + kick * 0.2);
  col += mix(uColorBass, vec3(1.0, 0.72, 0.4), 0.5) * trail * 1.15;
  // Soft residual sheet warmth after peaks.
  col += mix(uColorMid, vec3(1.0, 0.7, 0.42), 0.4) * uAfterglow * (0.1 + glow * 0.2);
  // Snare roadside-style flash along the braid flanks (outside the cores).
  float flank = smoothstep(0.35, 0.95, abs(uv.x)) * (1.0 - smoothstep(0.55, 1.2, abs(uv.y)));
  col += mix(uColorMid, vec3(1.0, 0.92, 0.85), 0.4) * flank * snare * 0.55;

  float barFlash = pow(1.0 - uBarPhase, 8.0) * (0.06 + flare * 0.1);
  col += uColorHigh * barFlash;

  float vig = 1.0 - smoothstep(0.7, 1.55, length(uv));
  col *= 0.55 + 0.45 * vig;

  float alpha = mix(0.7 + glow * 0.3 + uAfterglow * 0.12, 1.0, uBgAlpha);
  alpha = clamp(alpha, 0.0, 1.0);
  if (uBgAlpha < 0.5) {
    float edge = smoothstep(1.3, 0.3, length(uv));
    alpha *= 0.35 + edge * 0.65;
    col *= 0.85 + glow * 0.4;
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

export function SilkWakeScene({
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
  const kickSmooth = useRef(0);
  const snareSmooth = useRef(0);
  const hatSmooth = useRef(0);

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const ribbonCount = tier === 'high' ? RIBBONS_HIGH : tier === 'mid' ? RIBBONS_MID : RIBBONS_LOW;
  const flashAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const kitAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const fragmentShader = useMemo(() => buildFragmentShader(ribbonCount), [ribbonCount]);

  const uniforms = useMemo(
    () => ({
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uSwell: { value: 0.15 },
      uGather: { value: 0 },
      uImpact: { value: 0 },
      uAfterglow: { value: 0 },
      uKick: { value: 0 },
      uSnare: { value: 0 },
      uHat: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
      uShimmer: { value: 0 },
      uEnergy: { value: 0 },
      uBarPhase: { value: 0 },
      uBgAlpha: { value: 1 },
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

    timeRef.current +=
      dt * pace * sectionPace * calm * (0.55 + m.swell * 0.7 + m.impact * 0.25);

    gatherSmooth.current = smoothToward(gatherSmooth.current, m.gather, dt, 0.04, 0.14);
    swellSmooth.current = smoothToward(swellSmooth.current, m.swell, dt, 0.12, 0.45);
    impactSmooth.current = smoothToward(
      impactSmooth.current,
      Math.min(1.2, m.impact * 0.95 + m.release * 0.25) * flashAmp,
      dt,
      0.03,
      0.16,
    );
    afterglowSmooth.current = smoothToward(
      afterglowSmooth.current,
      m.afterglow,
      dt,
      0.18,
      0.85,
    );
    // Kit accents: kick thrusts rise fast / fall medium; snare cracks fast;
    // hats tick with a very short fall so mote glitter stays crisp.
    kickSmooth.current = smoothToward(
      kickSmooth.current,
      Math.min(1.2, m.kick) * kitAmp,
      dt,
      0.025,
      0.14,
    );
    snareSmooth.current = smoothToward(
      snareSmooth.current,
      Math.min(1.2, m.snare) * kitAmp,
      dt,
      0.02,
      0.12,
    );
    hatSmooth.current = smoothToward(
      hatSmooth.current,
      Math.min(1.2, m.hat) * kitAmp,
      dt,
      0.015,
      0.08,
    );

    mat.uniforms.uResolution!.value.set(size.width, size.height);
    mat.uniforms.uTime!.value = timeRef.current;
    mat.uniforms.uSwell!.value = swellSmooth.current;
    mat.uniforms.uGather!.value = gatherSmooth.current;
    mat.uniforms.uImpact!.value = impactSmooth.current;
    mat.uniforms.uAfterglow!.value = afterglowSmooth.current;
    mat.uniforms.uKick!.value = kickSmooth.current;
    mat.uniforms.uSnare!.value = snareSmooth.current;
    mat.uniforms.uHat!.value = hatSmooth.current;
    mat.uniforms.uBass!.value = m.bass;
    mat.uniforms.uMid!.value = m.mid;
    mat.uniforms.uHigh!.value = m.high;
    mat.uniforms.uShimmer!.value = m.shimmer * flashAmp;
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
