'use client';

/**
 * Thunderhead — towering night storm cloud lit from within. Musical anatomy:
 *  - idle / swell → volumetric cumulonimbus rolls in slow turbulence over a dark horizon
 *  - kick → interior lightning flash from a shifting belly pocket (no two strikes alike)
 *  - snare → lateral rain-curtain shear beneath the cloud base
 *  - hat → faint high-altitude static filaments
 *  - gather → pre-beat inhale swell of the mass
 *  - leanIn → storm looms nearer; cloud base darkens expectantly (pre-drop approach)
 *  - tension → towers taller and darker as the build climbs
 *  - dropEvent → full sky discharge + rolling shudder
 *  - tenderness → silver moonlit cloud edges
 *  - holdBreath / deep silence → pregnant stillness before the strike; thaw on return
 *  - echo → one-shot distant sheet-lightning flicker train in phrase gaps (cooler, no shudder)
 *
 * Tier: high marches denser; mid fewer steps; low uses a soft billboard cloud.
 */

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';

const STEPS_HIGH = 40;
const STEPS_MID = 26;
const STEPS_LOW = 14;

const OCTAVES_HIGH = 5;
const OCTAVES_MID = 4;
const OCTAVES_LOW = 3;

function buildFragmentShader(
  marchSteps: number,
  noiseOctaves: number,
  billboard: boolean,
): string {
  return /* glsl */ `
#define MARCH_STEPS ${marchSteps}
#define NOISE_OCTAVES ${noiseOctaves}
#define BILLBOARD ${billboard ? 1 : 0}

uniform vec2 uResolution;
uniform float uTime;
uniform float uTurb;
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
uniform float uLean;
uniform float uEcho;
uniform float uEchoTravel;
uniform float uDrop;
uniform float uShudder;
uniform float uStrikeSeed;
uniform vec2 uStrikePos;
uniform vec3 uColorBass;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash21(i.xy + i.z * 17.13);
  float n100 = hash21(i.xy + vec2(1.0, 0.0) + i.z * 17.13);
  float n010 = hash21(i.xy + vec2(0.0, 1.0) + i.z * 17.13);
  float n110 = hash21(i.xy + vec2(1.0, 1.0) + i.z * 17.13);
  float n001 = hash21(i.xy + (i.z + 1.0) * 17.13);
  float n101 = hash21(i.xy + vec2(1.0, 0.0) + (i.z + 1.0) * 17.13);
  float n011 = hash21(i.xy + vec2(0.0, 1.0) + (i.z + 1.0) * 17.13);
  float n111 = hash21(i.xy + vec2(1.0, 1.0) + (i.z + 1.0) * 17.13);
  float x00 = mix(n000, n100, f.x);
  float x10 = mix(n010, n110, f.x);
  float x01 = mix(n001, n101, f.x);
  float x11 = mix(n011, n111, f.x);
  float y0 = mix(x00, x10, f.y);
  float y1 = mix(x01, x11, f.y);
  return mix(y0, y1, f.z);
}

float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < NOISE_OCTAVES; i++) {
    v += a * vnoise(p);
    p = p * 2.07 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return v;
}

// Soft anvil / cumulonimbus envelope — wide base, towering core, flattened top.
float cloudEnvelope(vec3 p, float tower, float swell) {
  vec3 q = p;
  q.y *= mix(1.0, 0.72, tower);
  q.y -= tower * 0.35;
  float base = length(q.xz * vec2(0.72, 0.95));
  float height = q.y;
  float body = 1.0 - smoothstep(0.55 + swell * 0.28, 1.35 + swell * 0.15, base);
  float loft = smoothstep(-0.15, 0.35, height) * (1.0 - smoothstep(0.55 + tower * 0.55, 1.45 + tower * 0.7, height));
  float anvil = smoothstep(0.35, 0.85, height) * (1.0 - smoothstep(0.9, 1.55, base * (1.0 - tower * 0.2)));
  return clamp(body * loft + anvil * 0.55, 0.0, 1.0);
}

float cloudDensity(vec3 p, float tower, float swell, float still) {
  float env = cloudEnvelope(p, tower, swell);
  if (env < 0.02) return 0.0;
  vec3 np = p * (1.55 + swell * 0.25);
  np.x += uTurb * 0.35;
  np.z -= uTurb * 0.22;
  // holdBreath nearly freezes advection so the mass hangs pregnant.
  np += vec3(uTime * 0.07, uTime * 0.045, -uTime * 0.055) * mix(1.0, 0.08, still);
  float n = fbm(np);
  n = smoothstep(0.32 - swell * 0.12, 0.78, n);
  return env * n;
}

vec3 skyGradient(vec2 uv, float tension, float soft) {
  float y = uv.y;
  vec3 zenith = mix(vec3(0.02, 0.03, 0.07), vec3(0.01, 0.02, 0.05), tension);
  vec3 midSky = mix(uColorBass, vec3(0.06, 0.08, 0.14), 0.55) * (0.35 - tension * 0.12);
  vec3 horizon = mix(uColorMid, vec3(0.12, 0.14, 0.22), 0.4) * (0.55 - tension * 0.18);
  // Tenderness silvers the low sky rim.
  horizon = mix(horizon, mix(horizon, vec3(0.55, 0.62, 0.78), 0.55), soft * 0.45);
  vec3 col = mix(horizon, midSky, smoothstep(-0.35, 0.25, y));
  col = mix(col, zenith, smoothstep(0.15, 1.1, y));
  return col;
}

float rainCurtain(vec2 uv, float snare, float still) {
  // Rain hangs under the cloud base; snare shears it laterally.
  float under = 1.0 - smoothstep(-0.05, 0.42, uv.y);
  float side = 1.0 - smoothstep(0.95, 1.55, abs(uv.x));
  float shear = uv.x + snare * 0.12 * sign(uv.x + 1e-4);
  float streak = hash21(vec2(floor(shear * 42.0), floor((uv.y + uTime * mix(1.8, 0.12, still)) * 18.0)));
  streak = smoothstep(0.72, 0.98, streak);
  return streak * under * side * (0.35 + snare * 0.85 + uBass * 0.2);
}

float staticFilaments(vec2 uv, float hat, float still) {
  // High-altitude hairline sparks — only near the anvil crown.
  float crown = smoothstep(0.25, 0.85, uv.y) * (1.0 - smoothstep(0.55, 1.35, length(uv * vec2(0.85, 1.1))));
  float filament = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float seed = fract(sin((fi + uStrikeSeed) * 19.17) * 43758.5453);
    float ang = seed * 6.2831853 + uTime * mix(0.4, 0.04, still);
    vec2 dir = vec2(cos(ang), sin(ang * 0.55 + 0.4));
    vec2 origin = vec2((seed - 0.5) * 1.1, 0.45 + seed * 0.35);
    float d = abs(dot(uv - origin, vec2(-dir.y, dir.x)));
    float along = dot(uv - origin, dir);
    float seg = exp(-d * d / 0.00035) * smoothstep(0.35, 0.0, abs(along - 0.12));
    filament += seg * step(0.35, fract(seed * 7.1 + hat));
  }
  return filament * crown * hat * mix(1.0, 0.7, still);
}

float lightningBolt(vec2 uv, vec2 pocket, float amp, float seed) {
  if (amp < 0.02) return 0.0;
  vec2 a = pocket;
  vec2 b = pocket + vec2((hash21(vec2(seed, 1.7)) - 0.5) * 0.55, -0.55 - hash21(vec2(seed, 3.1)) * 0.35);
  vec2 c = mix(a, b, 0.45) + vec2((hash21(vec2(seed, 5.9)) - 0.5) * 0.4, 0.05);
  // Soft distance to a bent polyline through the cloud belly.
  float d1 = length(uv - a);
  float d2 = length(uv - mix(a, c, clamp(dot(uv - a, c - a) / max(dot(c - a, c - a), 1e-5), 0.0, 1.0)));
  float d3 = length(uv - mix(c, b, clamp(dot(uv - c, b - c) / max(dot(b - c, b - c), 1e-5), 0.0, 1.0)));
  float d = min(d1, min(d2, d3));
  float core = exp(-d * d / 0.0018);
  float glow = exp(-d * d / 0.018);
  return (core * 1.4 + glow * 0.55) * amp;
}

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);

  float kick = clamp(uKick, 0.0, 1.2);
  float snare = clamp(uSnare, 0.0, 1.2);
  float soft = clamp(uTenderness, 0.0, 1.0);
  float still = clamp(uStillness, 0.0, 1.0);
  float tower = clamp(uTension, 0.0, 1.2);
  float lean = clamp(uLean, 0.0, 1.0);
  float swell = clamp(uGather * 0.85 + uSwell * 0.35, 0.0, 1.35);
  float drop = clamp(uDrop, 0.0, 1.4);

  // Drop shudder + soft gather settle so the sky feels physical.
  uv.x += sin(uTime * 28.0 + uStrikeSeed) * uShudder * 0.035;
  uv.y += cos(uTime * 21.0) * uShudder * 0.02;
  uv *= 1.0 - uGather * 0.08;
  // LeanIn: isotropic approach zoom — storm drifts nearer (not tension's tower).
  uv *= 1.0 - lean * 0.12;
  uv.y -= tower * 0.06;

  vec3 sky = skyGradient(uv, tower, soft);
  // Expectant base darkening under lean — horizon hushes as the mass looms.
  sky *= mix(1.0, 0.78, lean * 0.55);
  vec3 col = sky;

  float densityAccum = 0.0;
  float lightAccum = 0.0;
  float edgeAccum = 0.0;

#if BILLBOARD
  // Low tier: soft billboard cloud — one FBM sheet, no volume march.
  vec2 cuv = uv * vec2(1.15, 1.35);
  cuv.y += 0.12;
  float env2 = cloudEnvelope(vec3(cuv.x, cuv.y, 0.0), tower, swell);
  float n2 = fbm(vec3(cuv * 1.6, uTurb * 0.4));
  n2 = smoothstep(0.3 - swell * 0.1, 0.75, n2);
  densityAccum = env2 * n2;
  edgeAccum = env2 * (1.0 - n2) * 0.65;
  lightAccum = densityAccum * (0.35 + kick * 0.55 + drop * 0.7);
#else
  // Volume march through a stacked cumulonimbus slab.
  // LeanIn pulls the camera slightly into the storm (approach, not tower growth).
  vec3 ro = vec3(0.0, 0.15, -2.4 + lean * 0.38);
  vec3 rd = normalize(vec3(uv * 1.15, 1.55));
  float t = 1.35;
  float dt = 2.2 / float(MARCH_STEPS);
  for (int i = 0; i < MARCH_STEPS; i++) {
    vec3 p = ro + rd * t;
    // Map sample into cloud local space centered above the horizon.
    vec3 local = p;
    local.y -= 0.35;
    local.xz *= 0.85;
    float d = cloudDensity(local, tower, swell, still);
    // Beer's-law-ish accumulate; darker when tension towers.
    float absorb = d * (0.22 + tower * 0.08) * dt * 8.0;
    densityAccum += absorb * (1.0 - densityAccum);
    // Rim / edge bias for moonlit silver later.
    edgeAccum += d * (1.0 - d) * dt * 3.5 * (1.0 - densityAccum);
    // Interior scatter — brighter near lightning / drop.
    lightAccum += d * dt * (1.4 + kick * 2.2 + drop * 3.0) * (1.0 - densityAccum);
    t += dt;
    if (densityAccum > 0.96) break;
  }
#endif

  densityAccum = clamp(densityAccum, 0.0, 1.0);
  edgeAccum = clamp(edgeAccum, 0.0, 1.2);
  lightAccum = clamp(lightAccum, 0.0, 1.6);

  // Cloud body: cool night greys pulled toward living palette.
  vec3 deep = mix(uColorBass, vec3(0.08, 0.1, 0.16), 0.55) * (0.42 - tower * 0.12);
  // Lean darkens the belly — expectant loom, distinct from tension's height stretch.
  deep *= mix(1.0, 0.62, lean * 0.7);
  vec3 body = mix(uColorMid, vec3(0.28, 0.32, 0.4), 0.4) * (0.7 - tower * 0.18);
  body *= mix(1.0, 0.78, lean * 0.45);
  vec3 rim = mix(uColorHigh, vec3(0.72, 0.8, 0.92), 0.35);
  rim = mix(rim, vec3(0.82, 0.88, 1.0), soft * 0.55);
  vec3 cloudCol = mix(deep, body, smoothstep(0.1, 0.75, densityAccum));
  cloudCol = mix(cloudCol, rim, clamp(edgeAccum * (0.35 + soft * 0.55), 0.0, 0.85));
  // Interior scatter warmth on kick belly / afterglow residue.
  cloudCol += mix(uColorBass, vec3(0.55, 0.62, 0.85), 0.35) * lightAccum * (0.18 + kick * 0.28 + uAfterglow * 0.2);
  cloudCol *= mix(1.0, 0.78, still);

  col = mix(col, cloudCol, densityAccum * (0.82 + swell * 0.12));

  // Kick / drop lightning — pocket wanders with strike seed so each hit is unique.
  vec2 pocket = uStrikePos;
  float bolt = lightningBolt(uv, pocket, kick * 0.95 + drop * 1.15, uStrikeSeed);
  // Secondary pocket for drop full-sky discharge.
  vec2 pocket2 = uStrikePos * vec2(-0.7, 0.85) + vec2(0.15, 0.08);
  bolt += lightningBolt(uv, pocket2, drop * 0.9, uStrikeSeed + 17.0) * 0.85;
  vec3 flashCol = mix(vec3(0.75, 0.85, 1.0), uColorHigh, 0.35);
  col += flashCol * bolt;
  // Soft belly fill so strikes read as interior light, not surface sticks.
  float belly = densityAccum * exp(-length(uv - pocket) * 2.4);
  col += flashCol * belly * (kick * 0.55 + drop * 0.85);

  // Phrase-echo: one-shot distant sheet-lightning — faint diffuse interior
  // flickers cresting across the belly by travel slot. Cooler + dimmer than
  // kick pocket strikes; never drives shudder.
  float echoPulse = uEcho * (1.0 - clamp(uEchoTravel, 0.0, 1.0) * 0.85);
  echoPulse *= mix(1.0, 0.45, still);
  float sheet = 0.0;
  if (echoPulse > 0.01) {
    float travel = clamp(uEchoTravel, 0.0, 1.0);
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float slot = (fi + 0.5) / 5.0;
      float crestDist = abs(slot - travel);
      float crestWrap = min(crestDist, 1.0 - crestDist);
      float crestEnv =
        exp(-crestWrap * crestWrap * 55.0) *
        (0.4 + 0.6 * max(0.0, sin(travel * 3.14159265 * 10.0 + fi * 2.7)));
      vec2 ep =
        vec2((hash21(vec2(fi + 1.3, 4.7)) - 0.5) * 0.95, 0.02 + hash21(vec2(fi, 9.1)) * 0.48);
      float diffuse = densityAccum * exp(-length(uv - ep) * 1.55);
      // Soft bloom — sheet glow, not a hard bolt core.
      float bloom = exp(-length(uv - ep) * 0.55) * 0.35;
      sheet += (diffuse * 0.85 + bloom) * crestEnv;
    }
  }
  // Cool silver-blue reply — colder than kick flash white / drop discharge.
  vec3 echoCol = mix(vec3(0.48, 0.68, 0.95), uColorHigh, 0.18);
  col += echoCol * sheet * echoPulse * 0.55;

  // Rain curtain under the base — snare shears it.
  float rain = rainCurtain(uv, snare, still);
  col += mix(uColorMid, vec3(0.55, 0.65, 0.8), 0.4) * rain * 0.55;

  // Hat static filaments along the anvil.
  float filaments = staticFilaments(uv, clamp(uHat, 0.0, 1.2), still);
  col += mix(uColorHigh, vec3(1.0), 0.35) * filaments * 1.15;

  // Tenderness moonlit rim lift — distinct from flash white.
  col += rim * edgeAccum * soft * 0.28;
  // holdBreath cool hush — pregnant pause, not tender silver.
  vec3 hush = mix(deep, vec3(0.12, 0.14, 0.2), 0.4);
  col = mix(col, mix(col, hush, 0.35), still * 0.4);

  float barFlash = pow(1.0 - uBarPhase, 9.0) * (0.04 + drop * 0.08);
  col += uColorHigh * barFlash;

  float vig = 1.0 - smoothstep(0.95, 1.75, length(uv * vec2(0.85, 1.0)));
  col *= 0.55 + 0.45 * vig;

  float alpha = mix(0.72 + densityAccum * 0.25 + bolt * 0.08, 1.0, uBgAlpha);
  alpha = clamp(alpha, 0.0, 1.0);
  if (uBgAlpha < 0.5) {
    float edge = smoothstep(1.45, 0.2, length(uv));
    alpha *= 0.28 + edge * 0.72;
    col *= 0.88 + densityAccum * 0.25;
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

function hash01(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function ThunderheadScene({
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
  const turbRef = useRef(0);
  const gatherSmooth = useRef(0);
  const kickSmooth = useRef(0);
  const snareSmooth = useRef(0);
  const hatSmooth = useRef(0);
  const swellSmooth = useRef(0.15);
  const afterglowSmooth = useRef(0);
  const stillnessSmooth = useRef(0);
  const tenderSmooth = useRef(0);
  const tensionSmooth = useRef(0);
  const leanSmooth = useRef(0);
  // Phrase-echo one-shot: arm on quiet, fire one sheet-lightning flicker train.
  const echoSmooth = useRef(0);
  const echoTravel = useRef(1); // 0..1 traveling; >=1 idle
  const echoArmed = useRef(true);
  const prevEcho = useRef(0);
  const dropSmooth = useRef(0);
  const shudderSmooth = useRef(0);
  const strikeSeed = useRef(1.7);
  const strikePos = useRef(new THREE.Vector2(0.05, 0.22));
  const prevKick = useRef(0);
  const prevDrop = useRef(0);

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const billboard = tier === 'low';
  const marchSteps = tier === 'high' ? STEPS_HIGH : tier === 'mid' ? STEPS_MID : STEPS_LOW;
  const noiseOctaves =
    tier === 'high' ? OCTAVES_HIGH : tier === 'mid' ? OCTAVES_MID : OCTAVES_LOW;
  const kitAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const stillAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const tenderAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  const tensionAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const leanAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  const echoAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;

  const fragmentShader = useMemo(
    () => buildFragmentShader(marchSteps, noiseOctaves, billboard),
    [marchSteps, noiseOctaves, billboard],
  );

  const uniforms = useMemo(
    () => ({
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uTurb: { value: 0 },
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
      uLean: { value: 0 },
      uEcho: { value: 0 },
      uEchoTravel: { value: 1 },
      uDrop: { value: 0 },
      uShudder: { value: 0 },
      uStrikeSeed: { value: 1.7 },
      uStrikePos: { value: new THREE.Vector2(0.05, 0.22) },
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

    tensionSmooth.current = smoothToward(
      tensionSmooth.current,
      m.tension * tensionAmp,
      dt,
      0.12,
      0.45,
    );

    // LeanIn: fast climb into anticipation, slower release into the drop.
    // Soften only a little under holdBreath so approach still reads through hush.
    leanSmooth.current = smoothToward(
      leanSmooth.current,
      Math.min(1, m.leanIn) * leanAmp,
      dt,
      0.06,
      0.18,
    );
    const lean = leanSmooth.current * (1 - stillness * 0.35);

    // Phrase-echo: arm on quiet, fire one cool sheet-lightning train per gap.
    echoSmooth.current = smoothToward(
      echoSmooth.current,
      Math.min(1, m.echo) * echoAmp,
      dt,
      0.05,
      0.28,
    );
    const echoNow = echoSmooth.current;
    if (echoNow < 0.08) echoArmed.current = true;
    if (echoArmed.current && echoNow > 0.22 && prevEcho.current <= 0.22) {
      echoTravel.current = 0;
      echoArmed.current = false;
    }
    prevEcho.current = echoNow;
    if (echoTravel.current < 1) {
      const bpm = m.bpm && m.bpm > 30 ? m.bpm : 120;
      const echoPace = 0.9 + pace * 0.15;
      echoTravel.current = Math.min(
        1,
        echoTravel.current + dt * echoPace * (0.85 + bpm / 180),
      );
    }
    const traveling = echoTravel.current < 1;
    const echoVis = traveling
      ? echoSmooth.current * (1 - echoTravel.current * 0.3)
      : echoSmooth.current * 0.04;

    // Drop springs loose tension tower and fires the sky-split discharge.
    const dropTarget =
      Math.min(1.35, m.dropEvent * 1.05 + m.impact * 0.25 + m.release * 0.15) * kitAmp;
    dropSmooth.current = smoothToward(dropSmooth.current, dropTarget, dt, 0.03, 0.55);
    shudderSmooth.current = smoothToward(
      shudderSmooth.current,
      Math.min(1.2, m.dropEvent * 1.1 + m.impact * 0.2) * kitAmp,
      dt,
      0.02,
      0.28,
    );

    const sectionPace =
      (0.75 + m.sectionLevel * 0.45) * (1 - tenderSmooth.current * 0.22);

    timeRef.current +=
      dt * pace * sectionPace * calm * motionMul * (0.5 + m.swell * 0.55 + m.impact * 0.15);

    gatherSmooth.current = smoothToward(gatherSmooth.current, m.gather, dt, 0.04, 0.14);
    swellSmooth.current = smoothToward(swellSmooth.current, m.swell, dt, 0.12, 0.45);
    afterglowSmooth.current = smoothToward(afterglowSmooth.current, m.afterglow, dt, 0.18, 0.8);

    kickSmooth.current = smoothToward(
      kickSmooth.current,
      Math.min(1.2, m.kick) * kitAmp,
      dt,
      0.02,
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
      Math.min(1.2, m.hat * 0.95 + m.shimmer * 0.2) * kitAmp,
      dt,
      0.025,
      0.1,
    );

    // Advance strike pocket when a kick or drop attack lands so flashes wander.
    const kickNow = kickSmooth.current;
    const dropNow = dropSmooth.current;
    if (kickNow > 0.28 && prevKick.current < 0.22) {
      strikeSeed.current += 1.618 + hash01(strikeSeed.current) * 3.1;
      const s = strikeSeed.current;
      strikePos.current.set((hash01(s) - 0.5) * 0.9, 0.05 + hash01(s + 2.3) * 0.45);
    }
    if (dropNow > 0.4 && prevDrop.current < 0.28) {
      strikeSeed.current += 4.7 + hash01(strikeSeed.current + 9.1) * 2.4;
      const s = strikeSeed.current;
      strikePos.current.set((hash01(s + 1.1) - 0.5) * 0.7, 0.12 + hash01(s + 4.4) * 0.4);
    }
    prevKick.current = kickNow;
    prevDrop.current = dropNow;

    // Continuous turbulence crawl — nearly freezes under holdBreath.
    turbRef.current +=
      dt *
      pace *
      sectionPace *
      calm *
      motionMul *
      (0.35 + swellSmooth.current * 0.55 + m.energy * 0.25 + tensionSmooth.current * 0.2);

    mat.uniforms.uResolution!.value.set(size.width, size.height);
    mat.uniforms.uTime!.value = timeRef.current;
    mat.uniforms.uTurb!.value = turbRef.current;
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
    mat.uniforms.uLean!.value = lean;
    mat.uniforms.uEcho!.value = echoVis;
    mat.uniforms.uEchoTravel!.value = echoTravel.current;
    mat.uniforms.uDrop!.value = dropSmooth.current;
    mat.uniforms.uShudder!.value = shudderSmooth.current;
    mat.uniforms.uStrikeSeed!.value = strikeSeed.current;
    (mat.uniforms.uStrikePos!.value as THREE.Vector2).copy(strikePos.current);
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
