'use client';

/**
 * Frost Bloom — dark night glass seen flat-on, frost growing as living light.
 * The roster's first winter piece and first *growing structure* — dendrites
 * accrete with the music instead of moving through space. Musical anatomy:
 *  - idle / swell → feathery crystals breathe slowly across the pane
 *  - kick → visible new branch segments crystallize outward (growth spurts)
 *  - snare → one lateral shear crack flashing across the glass
 *  - hat → tiny prismatic ice glints on branch tips
 *  - gather → growth poises — tips brighten, braced to extend
 *  - tension → deep-freeze: pane darkens blue-black, growth turns tighter
 *    and needle-fine as the build climbs
 *  - dropEvent → flash-freeze one whole-pane crystalline bloom, then rest
 *  - tenderness → warm thaw — edges soften, glisten wet, growth slows to honey
 *  - holdBreath / deep silence → still every crystal, glints held mid-sparkle
 */

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';

const SEEDS_HIGH = 7;
const SEEDS_MID = 5;
const SEEDS_LOW = 3;

const BRANCH_HIGH = 5;
const BRANCH_MID = 4;
const BRANCH_LOW = 3;

function buildFragmentShader(seedCount: number, branchDepth: number): string {
  return /* glsl */ `
#define SEED_COUNT ${seedCount}
#define BRANCH_DEPTH ${branchDepth}

uniform vec2 uResolution;
uniform float uTime;
uniform float uGrowth;
uniform float uGather;
uniform float uKick;
uniform float uSnare;
uniform float uHat;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uSwell;
uniform float uAfterglow;
uniform float uEnergy;
uniform float uBarPhase;
uniform float uBgAlpha;
uniform float uStillness;
uniform float uTenderness;
uniform float uTension;
uniform float uDrop;
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

// Soft ribbon along a 1D axis (branch spine).
float spine(float d, float width) {
  return exp(-d * d / max(width * width, 1e-6));
}

// One dendrite crystal grown from a seed: hexagonal main axes + feathery
// side spurs. growth (0-1+) gates how far the frost has accreted.
// Returns vec3(frost, tipMask, prism).
vec3 dendrite(vec2 p, float growth, float seed, float needle, float soft) {
  float d0 = length(p) + 1e-4;
  float ang = atan(p.y, p.x);

  // Hexagonal crystal bias — frost prefers 60-degree axes.
  float hex = abs(cos(ang * 3.0 + seed * 6.28318));
  float hexSharp = mix(3.4, 5.2, needle);
  hexSharp = mix(hexSharp, mix(2.2, 3.0, needle), soft);
  float axis = pow(max(hex, 1e-4), hexSharp);

  float frost = 0.0;
  float tips = 0.0;
  float prism = 0.0;

  // Reach grows with accretion; kick/drop push further in the caller.
  float reach = growth * (0.55 + seed * 0.35);
  float within = 1.0 - smoothstep(reach * 0.92, reach * 1.08, d0);

  for (int b = 0; b < BRANCH_DEPTH; b++) {
    float fi = float(b);
    float gen = fi / max(float(BRANCH_DEPTH - 1), 1.0);
    // Each generation fans finer side-branches (feathery dendrite look).
    float fold = abs(cos(ang * (3.0 + fi) + seed * 12.0 + fi * 1.7));
    float lobe = pow(max(fold, 1e-4), mix(2.8, 4.6, needle) * (1.0 - soft * 0.35));

    // Branch target radius for this generation — accretion frontier.
    float target = reach * (0.18 + gen * 0.78) * (0.55 + axis * 0.55 + lobe * 0.35);
    // Needle-fine under tension; honey-soft under tenderness.
    float width = mix(0.018, 0.007, needle) * (1.0 + soft * 0.85);
    width *= (1.0 - gen * 0.35) * (0.7 + lobe * 0.5);

    float line = spine(d0 - target, width);
    // Lateral thickness falls off away from the hex axis.
    float lateral = spine(abs(sin(ang * 3.0 + seed * 6.28)) * d0, width * (2.2 + soft));
    float branch = line * (0.35 + axis * 0.45 + lobe * 0.55) * lateral;
    branch *= within;

    // Only draw past earlier generations once growth has reached them —
    // this is what makes kick spurts read as *new segments*.
    float born = smoothstep(gen * 0.85, gen * 0.85 + 0.12, clamp(growth, 0.0, 1.4));
    branch *= born;

    frost += branch * (1.15 - gen * 0.35);

    // Tips live near the current growth frontier.
    float tipBand = exp(-pow((d0 - reach * 0.92) * 7.5, 2.0));
    tips += tipBand * lobe * axis * born * within;

    // Sparse prismatic sparkle sites along finer generations.
    float sparkSel = step(0.62, fract(seed * 7.13 + fi * 0.37 + hash21(vec2(fi, seed))));
    prism += branch * tipBand * sparkSel * (0.4 + gen);
  }

  // Soft frost haze filling between major axes (crystalline bloom body).
  float haze = axis * within * smoothstep(0.0, reach * 0.8, growth)
    * exp(-d0 * d0 * (1.8 - growth * 0.5));
  frost += haze * (0.22 + soft * 0.12);

  return vec3(clamp(frost, 0.0, 2.4), clamp(tips, 0.0, 1.8), clamp(prism, 0.0, 1.6));
}

vec3 iceWash(float r, float growth, float tension, float soft) {
  // Winter glass — cool deep pane, milk-ice mid, prism rim.
  vec3 deep = mix(uColorBass, vec3(0.08, 0.14, 0.28), 0.62) * 0.18;
  // Tension deep-freezes toward blue-black.
  deep = mix(deep, vec3(0.02, 0.05, 0.12), tension * 0.72);
  vec3 mid = mix(uColorMid, vec3(0.55, 0.72, 0.92), 0.48) * 0.42;
  vec3 rim = mix(uColorHigh, vec3(0.85, 0.94, 1.0), 0.4) * 0.55;
  // Tenderness warms the glass toward wet honey-thaw.
  mid = mix(mid, mix(mid, vec3(0.92, 0.82, 0.72), 0.55), soft * 0.5);
  rim = mix(rim, mix(rim, vec3(1.0, 0.9, 0.8), 0.45), soft * 0.45);
  vec3 col = mix(deep, mid, smoothstep(0.0, 0.7, r) * (0.35 + growth * 0.4));
  col = mix(col, rim, smoothstep(0.4, 1.2, r) * (0.2 + growth * 0.35));
  return col;
}

// Cheap spectral prism glint for hat tips / ice facets.
vec3 prismHue(float t) {
  return 0.55 + 0.45 * cos(6.28318 * t + vec3(0.0, 2.094, 4.188));
}

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);

  float kick = clamp(uKick, 0.0, 1.2);
  float snare = clamp(uSnare, 0.0, 1.2);
  float soft = clamp(uTenderness, 0.0, 1.0);
  float stillness = clamp(uStillness, 0.0, 1.0);
  float tension = clamp(uTension, 0.0, 1.2);
  float gather = clamp(uGather, 0.0, 1.0);
  float drop = clamp(uDrop, 0.0, 1.4);

  // Snare: lateral shear crack across the pane (before crystal sampling).
  uv.x += snare * 0.055 * sign(uv.x + 1e-4);
  // Drop: brief whole-pane crystalline swell.
  uv *= 1.0 - drop * 0.06;
  // Gather: slight center pull so tips feel braced, not drifting.
  float r0 = length(uv) + 1e-4;
  uv *= 1.0 - gather * 0.08 * smoothstep(0.15, 1.1, r0);

  float r = length(uv);

  // Growth: base accretion + kick spurts new segments + drop flash-freeze.
  float growth = clamp(uGrowth + kick * 0.28 + drop * 0.55, 0.0, 1.55);
  // Tension tightens reach slightly (needle densify, not expand).
  growth *= 1.0 - tension * 0.12;
  // Tenderness slows accretion visually (honey thaw) without killing it.
  growth *= mix(1.0, 0.78, soft);

  float needle = clamp(tension * 0.95, 0.0, 1.0);
  float contrast = mix(1.0, 0.55, stillness);
  contrast = mix(contrast, mix(contrast, 0.72, soft), soft * 0.4);

  float frost = 0.0;
  float tips = 0.0;
  float prism = 0.0;

  // Seed lattice — irregular night-glass nucleation points.
  for (int i = 0; i < SEED_COUNT; i++) {
    float fi = float(i);
    float seed = fract(sin(fi * 19.17 + 2.4) * 43758.5453);
    float ang0 = seed * 6.28318 + fi * 0.9;
    float rad0 = 0.08 + fract(seed * 3.7) * 0.42;
    // Slight living drift of nucleation (gated by stillness / tenderness).
    float drift = (0.012 + uSwell * 0.01) * mix(1.0, 0.08, stillness) * mix(1.0, 0.55, soft);
    vec2 origin = vec2(cos(ang0), sin(ang0)) * rad0;
    origin += vec2(
      sin(uTime * 0.11 + seed * 8.0),
      cos(uTime * 0.09 + seed * 5.0)
    ) * drift;

    // Per-seed growth stagger so kick spurts read as sequential crystallization.
    float localGrowth = growth * (0.78 + seed * 0.4) * (1.0 + kick * seed * 0.2);
    vec3 d = dendrite(uv - origin, localGrowth, seed, needle, soft);
    float weight = mix(1.1, 0.55, smoothstep(0.1, 1.15, length(origin)));
    frost += d.x * weight;
    tips += d.y * weight;
    prism += d.z * weight;
  }

  frost = clamp(frost, 0.0, 2.6) * contrast;
  tips = clamp(tips, 0.0, 1.8);
  prism = clamp(prism, 0.0, 1.6);

  // Soft pane body under the frost.
  vec3 body = iceWash(r, growth, tension, soft);
  body *= 0.5 + uEnergy * 0.18 + uAfterglow * 0.22;

  // Crystal palette: ice-blue deep → milk mid → prism high.
  vec3 iceCol = mix(uColorBass, uColorMid, smoothstep(0.0, 0.55, frost * 0.4 + r));
  iceCol = mix(iceCol, uColorHigh, smoothstep(0.35, 1.1, frost * 0.35 + r * 0.5));
  vec3 milkIce = mix(iceCol, vec3(0.78, 0.88, 1.0), 0.45);
  iceCol = mix(iceCol, milkIce, 0.28 + uAfterglow * 0.2);
  // Kick cools toward bright ice; snare cracks toward cooler white.
  iceCol = mix(iceCol, mix(uColorHigh, vec3(0.9, 0.96, 1.0), 0.5), kick * 0.35);
  iceCol = mix(iceCol, mix(uColorMid, vec3(0.95, 0.97, 1.0), 0.55), snare * 0.28);
  // Tenderness: warm wet thaw — distinct from holdBreath hush.
  vec3 thawHoney = mix(milkIce, vec3(1.0, 0.9, 0.78), 0.5);
  iceCol = mix(iceCol, thawHoney, soft * 0.48);
  body = mix(body, mix(body, thawHoney * 0.5, 0.4), soft * 0.35);
  // holdBreath cools contrast toward quiet night glass.
  vec3 hushGlass = mix(uColorBass, vec3(0.12, 0.18, 0.32), 0.4) * 0.5;
  iceCol = mix(iceCol, mix(iceCol, hushGlass, 0.4), stillness * 0.45);
  body *= mix(1.0, 0.7, stillness);
  // Tension deep-freeze cools body further.
  body *= mix(1.0, 0.62, tension * 0.55);

  vec3 col = body;
  col += iceCol * frost * (0.55 + kick * 0.2 + drop * 0.45);
  // Gather: tips brighten, braced to grow (expectant, not a freeze).
  col += mix(uColorHigh, vec3(0.92, 0.97, 1.0), 0.4) * tips * (0.35 + gather * 1.1);
  // Soft wet sheen on thaw.
  col += thawHoney * tips * soft * 0.35;

  // Snare crack flash — a bright lateral shear line across the pane.
  float crack = exp(-pow(abs(uv.y) * 14.0, 2.0)) * smoothstep(0.15, 0.85, abs(uv.x));
  col += mix(uColorMid, vec3(0.95, 0.98, 1.0), 0.5) * crack * snare * 0.85;

  // Hat prismatic tip glints — freeze mid-sparkle under holdBreath.
  vec3 prismCol = prismHue(uTime * 0.15 + frost * 0.2 + hash21(floor(uv * 40.0)));
  prismCol = mix(prismCol, uColorHigh, 0.25);
  col += prismCol * prism * uHat * 1.35;
  // Residual tip hang while listening.
  col += prismCol * prism * stillness * 0.2;
  // Gather tip glints without needing hats.
  col += prismCol * tips * gather * 0.45;

  // Drop whole-pane crystalline flash — bigger than any kick spurt.
  float dropFlare = drop * (1.25 + frost * 0.4);
  col += mix(milkIce, vec3(0.95, 0.98, 1.0), 0.45) * dropFlare * (0.22 + frost * 0.12);
  col += iceCol * dropFlare * 0.35 * exp(-r * r * 0.85);

  // Afterglow residual ice shimmer.
  col += milkIce * uAfterglow * (0.06 + frost * 0.08);

  float barFlash = pow(1.0 - uBarPhase, 9.0) * (0.04 + uEnergy * 0.08);
  col += milkIce * barFlash;

  // Night-glass vignette — pane edge darkens.
  float vig = 1.0 - smoothstep(0.7, 1.45, r);
  col *= 0.52 + 0.48 * vig;

  float alpha = mix(0.72 + frost * 0.22 + uAfterglow * 0.1, 1.0, uBgAlpha);
  alpha = clamp(alpha, 0.0, 1.0);
  if (uBgAlpha < 0.5) {
    float edge = smoothstep(1.3, 0.28, r);
    alpha *= 0.28 + edge * 0.72;
    col *= 0.88 + frost * 0.25;
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

export function FrostBloomScene({
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
  const growthSmooth = useRef(0.22);
  const gatherSmooth = useRef(0);
  const kickSmooth = useRef(0);
  const snareSmooth = useRef(0);
  const hatSmooth = useRef(0);
  const swellSmooth = useRef(0.15);
  const afterglowSmooth = useRef(0);
  const stillnessSmooth = useRef(0);
  const tenderSmooth = useRef(0);
  const tensionSmooth = useRef(0);
  const dropSmooth = useRef(0);

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const seedCount = tier === 'high' ? SEEDS_HIGH : tier === 'mid' ? SEEDS_MID : SEEDS_LOW;
  const branchDepth =
    tier === 'high' ? BRANCH_HIGH : tier === 'mid' ? BRANCH_MID : BRANCH_LOW;
  const kitAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const stillAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const tenderAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  const tensionAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const dropAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  const fragmentShader = useMemo(
    () => buildFragmentShader(seedCount, branchDepth),
    [seedCount, branchDepth],
  );

  const uniforms = useMemo(
    () => ({
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uGrowth: { value: 0.22 },
      uGather: { value: 0 },
      uKick: { value: 0 },
      uSnare: { value: 0 },
      uHat: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
      uSwell: { value: 0.15 },
      uAfterglow: { value: 0 },
      uEnergy: { value: 0 },
      uBarPhase: { value: 0 },
      uBgAlpha: { value: 1 },
      uStillness: { value: 0 },
      uTenderness: { value: 0 },
      uTension: { value: 0 },
      uDrop: { value: 0 },
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

    // Hold-breath stillness: crystals listen instead of growing through quiet.
    const stillnessTarget = Math.min(
      1,
      Math.max(m.holdBreath, m.silence * 0.92) + Math.min(m.holdBreath, m.silence) * 0.15,
    );
    stillnessSmooth.current = smoothToward(
      stillnessSmooth.current,
      stillnessTarget * stillAmp,
      dt,
      0.14,
      0.08,
    );
    const stillness = stillnessSmooth.current;
    const motionMul = 1 - stillness * 0.92;

    tenderSmooth.current = smoothToward(
      tenderSmooth.current,
      Math.min(1, m.tenderness) * tenderAmp,
      dt,
      0.12,
      0.22,
    );

    // Tension deep-freeze — slow climb, spring-loose on drop/release.
    const tensionTarget =
      m.dropEvent > 0.08 || m.release > 0.35 ? 0 : Math.min(1, m.tension) * tensionAmp;
    tensionSmooth.current = smoothToward(
      tensionSmooth.current,
      tensionTarget,
      dt,
      0.12,
      0.08,
    );

    // Drop flash-freeze — fast attack, lingering crystalline rest.
    const dropTarget =
      Math.min(1.35, m.dropEvent * 1.05 + m.impact * 0.2 + m.release * 0.12) * dropAmp;
    dropSmooth.current = smoothToward(dropSmooth.current, dropTarget, dt, 0.03, 0.55);
    const drop = dropSmooth.current;

    const sectionPace =
      (0.75 + m.sectionLevel * 0.45) * (1 - tenderSmooth.current * 0.28);

    // holdBreath gates nucleation drift / prism clock; kit envelopes stay live.
    timeRef.current +=
      dt *
      pace *
      sectionPace *
      calm *
      motionMul *
      (0.45 + m.swell * 0.55 + m.impact * 0.15 + drop * 0.2);

    gatherSmooth.current = smoothToward(gatherSmooth.current, m.gather, dt, 0.04, 0.14);
    swellSmooth.current = smoothToward(swellSmooth.current, m.swell, dt, 0.12, 0.45);
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
    // Hats off on low tier to keep the glint budget graceful.
    const hatTarget =
      tier === 'low'
        ? 0
        : Math.min(1.2, m.hat * 0.95 + m.shimmer * 0.25) * kitAmp;
    hatSmooth.current = smoothToward(hatSmooth.current, hatTarget, dt, 0.025, 0.1);
    afterglowSmooth.current = smoothToward(afterglowSmooth.current, m.afterglow, dt, 0.18, 0.8);

    // Accretion: swell + energy grow the frost; kick spurts handled in shader.
    // During holdBreath, hold mid-growth so crystals pause mid-bloom.
    const growthTargetLive =
      0.2 +
      swellSmooth.current * 0.55 +
      m.energy * 0.28 +
      m.bass * 0.1 +
      afterglowSmooth.current * 0.1 +
      drop * 0.2;
    const growthTarget =
      growthTargetLive * (1 - stillness) + growthSmooth.current * stillness;
    // Tenderness slows the rise so thaw feels honey-slow.
    const riseTau = 0.14 + tenderSmooth.current * 0.18;
    growthSmooth.current = smoothToward(growthSmooth.current, growthTarget, dt, riseTau, 0.4);

    mat.uniforms.uResolution!.value.set(size.width, size.height);
    mat.uniforms.uTime!.value = timeRef.current;
    mat.uniforms.uGrowth!.value = growthSmooth.current;
    mat.uniforms.uGather!.value = gatherSmooth.current;
    mat.uniforms.uKick!.value = kickSmooth.current;
    mat.uniforms.uSnare!.value = snareSmooth.current;
    mat.uniforms.uHat!.value = hatSmooth.current;
    mat.uniforms.uBass!.value = m.bass;
    mat.uniforms.uMid!.value = m.mid;
    mat.uniforms.uHigh!.value = m.high;
    mat.uniforms.uSwell!.value = swellSmooth.current;
    mat.uniforms.uAfterglow!.value = afterglowSmooth.current;
    mat.uniforms.uEnergy!.value = m.energy + afterglowSmooth.current * 0.25;
    mat.uniforms.uBarPhase!.value = m.barPhase;
    mat.uniforms.uBgAlpha!.value = backdrop ? 0 : 1;
    mat.uniforms.uStillness!.value = stillness;
    mat.uniforms.uTenderness!.value = tenderSmooth.current;
    mat.uniforms.uTension!.value = tensionSmooth.current;
    mat.uniforms.uDrop!.value = drop;
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
