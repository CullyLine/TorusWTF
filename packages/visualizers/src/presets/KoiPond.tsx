'use client';

/**
 * Koi Pond — midnight pond seen straight from above: black-mirror water,
 * a faint moon reflection, and koi as glowing living brushstrokes gliding
 * beneath the surface, each trailing a soft wake.
 * Musical anatomy:
 *  - kick → tail flick: surge of glide + one crisp ripple ring
 *  - snare → lateral fin-flick scatter across the school
 *  - hat → tiny surface dimple glints
 *  - gather → curves the koi toward center on a pre-beat inhale
 *  - tension → circles faster and tighter while the water darkens
 *  - dropEvent → one koi breaches — splash + full-pond ripple, then calm
 *  - leanIn → drift nearer the water; koi rise + glow brightens with expectation
 *  - echo → one-shot cool silver-blue ghost koi gliding across with a pale wake
 *  - tenderness → widens milky moon reflection + slows glide to honey
 *  - holdBreath / deep silence → hang every koi mid-glide; water to glass
 *
 * Distinct from Paper Lanterns (objects on water, side view) and Tidal
 * Sanctuary (open ocean swell) — top-down creatures under a black mirror.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';
import { getDotTexture } from '../dotTexture';

const KOI_HIGH = 18;
const KOI_MID = 11;
const KOI_LOW = 6;

const WAKE_PER_HIGH = 10;
const WAKE_PER_MID = 7;
const WAKE_PER_LOW = 4;

const GLINT_HIGH = 48;
const GLINT_MID = 24;
const GLINT_LOW = 0;

const RIPPLE_SLOTS = 6;
const WATER_SEGS_HIGH = 64;
const WATER_SEGS_MID = 48;
const WATER_SEGS_LOW = 32;

const WATER_Y = 0.02;
const KOI_DEPTH = -0.08;
const GHOST_WAKE = 8;
/** Cool silver-blue — phrase-memory ghost, cooler than warm koi / moon milk. */
const GHOST_SILVER = /* @__PURE__ */ new THREE.Color(0.58, 0.78, 0.98);

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
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function wrapTau(a: number) {
  const t = a % (Math.PI * 2);
  return t < 0 ? t + Math.PI * 2 : t;
}

const _dummy = /* @__PURE__ */ new THREE.Object3D();
const _color = /* @__PURE__ */ new THREE.Color();

const waterVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

function buildWaterFrag(rippleSlots: number): string {
  return /* glsl */ `
#define RIPPLE_SLOTS ${rippleSlots}

uniform float uTime;
uniform float uStillness;
uniform float uTenderness;
uniform float uTension;
uniform float uHat;
uniform float uSwell;
uniform float uAfterglow;
uniform float uMoonWiden;
uniform float uGlass;
uniform vec3 uColorBass;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;
uniform vec3 uMoon;
uniform vec4 uRipples[RIPPLE_SLOTS];

varying vec2 vUv;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  float r = length(uv);
  float edge = smoothstep(1.02, 0.72, r);
  if (edge < 0.004) discard;

  // Black-mirror pond bed — deep indigo, darkens under tension.
  vec3 deep = mix(uColorBass * 0.12, vec3(0.008, 0.012, 0.028), 0.72);
  deep *= 1.0 - uTension * 0.55;
  vec3 mid = mix(uColorMid * 0.22, vec3(0.02, 0.05, 0.09), 0.55);
  vec3 col = mix(deep, mid, smoothstep(0.0, 0.85, r) * 0.35);

  // Soft undulation — freezes toward glass under holdBreath.
  float motion = 1.0 - uStillness * 0.94;
  float glass = clamp(uGlass, 0.0, 1.0);
  float wave =
    sin(uv.x * 9.0 + uTime * 0.55 * motion) *
    cos(uv.y * 7.5 - uTime * 0.42 * motion) *
    (0.012 + uSwell * 0.01) *
    motion *
    (1.0 - glass * 0.92);
  col += vec3(0.02, 0.04, 0.06) * wave * 4.0;

  // Faint moon reflection — widens to milky on tenderness.
  vec2 moonC = vec2(-0.18, 0.22);
  float moonR = 0.16 + uMoonWiden * 0.22 + uTenderness * 0.12;
  float moonD = length(uv - moonC);
  float moonSoft = exp(-moonD * moonD / max(moonR * moonR, 1e-4));
  float moonCore = exp(-moonD * moonD / max((moonR * 0.35) * (moonR * 0.35), 1e-4));
  vec3 moonCol = mix(uMoon, vec3(0.92, 0.94, 1.0), 0.35 + uTenderness * 0.4);
  col += moonCol * (moonSoft * (0.22 + uTenderness * 0.28) + moonCore * 0.35);
  // Milk veil under tenderness — softens contrast without washing koi.
  col = mix(col, mix(col, moonCol * 0.55, 0.45), uTenderness * 0.35);

  // Expanding ripple rings (kick + drop + occasional fin breaks).
  float ripples = 0.0;
  for (int i = 0; i < RIPPLE_SLOTS; i++) {
    vec4 rip = uRipples[i];
    float str = rip.z;
    float age = rip.w;
    if (str < 0.004 || age > 1.35) continue;
    vec2 c = rip.xy;
    float dist = length(uv - c);
    float radius = age * (0.18 + str * 0.55);
    float width = 0.012 + age * 0.018 + str * 0.008;
    float ring = exp(-pow((dist - radius) / max(width, 1e-4), 2.0));
    float fade = (1.0 - smoothstep(0.0, 1.25, age)) * str;
    ripples += ring * fade;
  }
  vec3 ripCol = mix(uColorHigh, vec3(0.75, 0.9, 1.0), 0.45);
  col += ripCol * ripples * (0.55 + uAfterglow * 0.2) * (1.0 - glass * 0.35);

  // Hat dimple sparkle — sparse surface ticks driven from CPU via uHat.
  float sparkSeed = hash21(floor(uv * 28.0) + floor(uTime * 6.0));
  float dimple = step(0.92 - uHat * 0.12, sparkSeed) * uHat;
  col += vec3(0.7, 0.85, 1.0) * dimple * 0.55 * (1.0 - glass);

  // Glass hush — mirror darkens and stills under holdBreath.
  col = mix(col, deep * 0.55 + moonCol * moonSoft * 0.12, glass * 0.72);

  float alpha = edge * (0.82 + uTenderness * 0.08);
  gl_FragColor = vec4(col, alpha);
}
`;
}

export function KoiPondScene({ analyser, palette, tier, speed = 1 }: VisualizerSceneProps) {
  const mods = useModulation();
  const rootRef = useRef<THREE.Group>(null);
  const koiRef = useRef<THREE.InstancedMesh>(null);
  const glowRef = useRef<THREE.InstancedMesh>(null);
  const wakeRef = useRef<THREE.Points>(null);
  const wakeMatRef = useRef<THREE.PointsMaterial>(null);
  const glintRef = useRef<THREE.Points>(null);
  const glintMatRef = useRef<THREE.PointsMaterial>(null);
  const splashRef = useRef<THREE.Points>(null);
  const splashMatRef = useRef<THREE.PointsMaterial>(null);
  const ghostRef = useRef<THREE.Mesh>(null);
  const ghostMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const ghostWakeRef = useRef<THREE.Points>(null);
  const ghostWakeMatRef = useRef<THREE.PointsMaterial>(null);
  const waterMatRef = useRef<THREE.ShaderMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();

  const koiCount = tier === 'high' ? KOI_HIGH : tier === 'mid' ? KOI_MID : KOI_LOW;
  const wakePer = tier === 'high' ? WAKE_PER_HIGH : tier === 'mid' ? WAKE_PER_MID : WAKE_PER_LOW;
  const wakeCount = koiCount * wakePer;
  const glintCount = tier === 'high' ? GLINT_HIGH : tier === 'mid' ? GLINT_MID : GLINT_LOW;
  const waterSegs =
    tier === 'high' ? WATER_SEGS_HIGH : tier === 'mid' ? WATER_SEGS_MID : WATER_SEGS_LOW;
  const koiSegs = tier === 'high' ? 8 : 6;
  const kitAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const stillAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const tenderAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  const tensionAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const dropAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const leanAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  const echoAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;

  const scratchBass = useRef(new THREE.Color());
  const scratchMid = useRef(new THREE.Color());
  const scratchHigh = useRef(new THREE.Color());
  const scratchMilk = useRef(new THREE.Color(0.82, 0.9, 1.0));
  const scratchHoney = useRef(new THREE.Color(1.0, 0.78, 0.48));
  const scratchMoon = useRef(new THREE.Color(0.72, 0.82, 0.98));
  const scratchKoiWarm = useRef(new THREE.Color(1.0, 0.55, 0.28));
  const scratchKoiWhite = useRef(new THREE.Color(0.95, 0.92, 0.88));
  const scratchWake = useRef(new THREE.Color(0.55, 0.78, 0.95));

  const gatherSmooth = useRef(0);
  const kickSmooth = useRef(0);
  const snareSmooth = useRef(0);
  const hatSmooth = useRef(0);
  const swellSmooth = useRef(0.15);
  const tenderSmooth = useRef(0);
  const afterglowSmooth = useRef(0);
  const stillnessSmooth = useRef(0);
  const tensionSmooth = useRef(0);
  const dropSmooth = useRef(0);
  // One-shot drop breach travel 0..1; >=1 idle.
  const dropTravel = useRef(1);
  // LeanIn anticipation: eager climb, slower release into the drop.
  const leanSmooth = useRef(0);
  // Phrase-echo one-shot: arm on quiet, fire one cool ghost koi per gap.
  const echoSmooth = useRef(0);
  const echoTravel = useRef(1); // 0..1 traveling; >=1 idle
  const echoArmed = useRef(true);
  const prevEcho = useRef(0);
  const echoSeed = useRef(0.37);
  const prevKick = useRef(0);
  const timeRef = useRef(0);
  const rippleCursor = useRef(0);
  const breachIndex = useRef(0);

  const angle = useRef(new Float32Array(koiCount));
  const radius = useRef(new Float32Array(koiCount));
  const scatterX = useRef(new Float32Array(koiCount));
  const scatterZ = useRef(new Float32Array(koiCount));
  const tailPhase = useRef(new Float32Array(koiCount));
  const pos = useRef(new Float32Array(koiCount * 3));
  const heading = useRef(new Float32Array(koiCount));
  const liftY = useRef(new Float32Array(koiCount));

  // Ripple slots: x, z, strength, age — age advances; strength fades via age.
  const ripples = useRef(new Float32Array(RIPPLE_SLOTS * 4));
  const rippleUniforms = useMemo(() => {
    const arr: THREE.Vector4[] = [];
    for (let i = 0; i < RIPPLE_SLOTS; i++) arr.push(new THREE.Vector4(0, 0, 0, 2));
    return arr;
  }, []);

  const sprite = useMemo(() => getDotTexture(), []);

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const { phases, sizes, bands, homeR, orbitSpd, wander } = useMemo(() => {
    const aArr = angle.current;
    const rArr = radius.current;
    const sx = scatterX.current;
    const sz = scatterZ.current;
    const tp = tailPhase.current;
    const p = pos.current;
    const hdg = heading.current;
    const ly = liftY.current;

    const ph = new Float32Array(koiCount);
    const szArr = new Float32Array(koiCount);
    const b = new Uint8Array(koiCount);
    const hr = new Float32Array(koiCount);
    const osp = new Float32Array(koiCount);
    const w = new Float32Array(koiCount);

    for (let i = 0; i < koiCount; i++) {
      const seed = i * 1.6180339887;
      const shell = Math.sqrt(hash01(seed + 0.11));
      const home = 0.45 + shell * 2.35;
      hr[i] = home;
      rArr[i] = home;
      aArr[i] = hash01(seed + 0.37) * Math.PI * 2;
      osp[i] = 0.35 + hash01(seed + 1.7) * 0.75;
      // Mix clockwise / counter for living cross-paths.
      if (i % 3 === 0) osp[i] = -osp[i]!;
      ph[i] = hash01(seed + 2.3);
      b[i] = i % 3;
      szArr[i] = 0.75 + hash01(seed + 2.9) * 0.7;
      w[i] = 0.55 + hash01(seed + 3.5) * 0.9;
      tp[i] = hash01(seed + 4.1) * Math.PI * 2;
      sx[i] = 0;
      sz[i] = 0;
      ly[i] = 0;
      const ang = aArr[i]!;
      p[i * 3] = Math.cos(ang) * home;
      p[i * 3 + 1] = KOI_DEPTH;
      p[i * 3 + 2] = Math.sin(ang) * home * 0.92;
      hdg[i] = ang + (osp[i]! >= 0 ? Math.PI / 2 : -Math.PI / 2);
    }

    angle.current = aArr;
    radius.current = rArr;
    scatterX.current = sx;
    scatterZ.current = sz;
    tailPhase.current = tp;
    pos.current = p;
    heading.current = hdg;
    liftY.current = ly;

    return { phases: ph, sizes: szArr, bands: b, homeR: hr, orbitSpd: osp, wander: w };
  }, [koiCount]);

  const wakePositions = useMemo(() => new Float32Array(wakeCount * 3), [wakeCount]);
  const wakeColors = useMemo(() => new Float32Array(wakeCount * 3), [wakeCount]);
  const glintPositions = useMemo(
    () => new Float32Array(Math.max(glintCount, 1) * 3),
    [glintCount],
  );
  const glintColors = useMemo(
    () => new Float32Array(Math.max(glintCount, 1) * 3),
    [glintCount],
  );
  const splashPositions = useMemo(() => new Float32Array(24 * 3), []);
  const splashColors = useMemo(() => new Float32Array(24 * 3), []);
  const ghostWakePositions = useMemo(() => new Float32Array(GHOST_WAKE * 3), []);
  const ghostWakeColors = useMemo(() => new Float32Array(GHOST_WAKE * 3), []);

  // Elongated brushstroke body — tip along +Z so yaw faces swim heading.
  const koiGeo = useMemo(() => {
    const geo = new THREE.SphereGeometry(0.055, koiSegs, koiSegs);
    geo.scale(0.55, 0.28, 1.85);
    return geo;
  }, [koiSegs]);

  const glowGeo = useMemo(() => {
    const geo = new THREE.SphereGeometry(0.07, 6, 6);
    geo.scale(0.7, 0.22, 1.6);
    return geo;
  }, []);

  const koiMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  const glowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  const waterFrag = useMemo(() => buildWaterFrag(RIPPLE_SLOTS), []);

  const spawnRipple = (x: number, z: number, strength: number) => {
    const slot = rippleCursor.current % RIPPLE_SLOTS;
    rippleCursor.current = slot + 1;
    const base = slot * 4;
    const r = ripples.current;
    // Map world XZ into water UV space (−1..1 across ~3.4 radius disc).
    r[base] = x / 3.4;
    r[base + 1] = z / 3.4;
    r[base + 2] = Math.min(1.35, strength);
    r[base + 3] = 0;
  };

  useFrame((_state, delta) => {
    const mesh = koiRef.current;
    if (!mesh) return;
    void analyser;
    void freqBuf;

    const m = metricsRef.current;
    const spd = mods.current.speed ?? speed;
    const dt = Math.min(delta, 0.05);
    const motionScale = reducedMotion ? 0.35 : 1;

    const stillnessTarget =
      Math.min(
        1,
        Math.max(m.holdBreath, m.silence * 0.92) + Math.min(m.holdBreath, m.silence) * 0.15,
      ) * stillAmp;
    stillnessSmooth.current = smoothToward(
      stillnessSmooth.current,
      stillnessTarget,
      dt,
      0.14,
      0.08,
    );
    const stillness = stillnessSmooth.current;
    const motionMul = 1 - stillness * 0.92;
    const glass = stillness;

    // LeanIn: fast climb into anticipation, slower release into the drop.
    // Soft under holdBreath so approach still reads through hush.
    // Distinct from gather (center-curve inhale) and tension (fast dark circle).
    leanSmooth.current = smoothToward(
      leanSmooth.current,
      Math.min(1, m.leanIn) * leanAmp,
      dt,
      0.06,
      0.18,
    );
    const lean = leanSmooth.current * (1 - stillness * 0.35);

    // Phrase-echo: arm on quiet, fire one cool silver ghost koi per gap.
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
      echoSeed.current = hash01(timeRef.current * 0.53 + echoNow * 11.3 + (m.barPhase ?? 0) * 2.7);
    }
    prevEcho.current = echoNow;
    if (echoTravel.current < 1) {
      const bpmEcho = m.bpm && m.bpm > 30 ? m.bpm : 120;
      const echoPace = 0.9 + spd * 0.15;
      echoTravel.current = Math.min(
        1,
        echoTravel.current + dt * echoPace * (0.85 + bpmEcho / 180),
      );
    }
    const traveling = echoTravel.current < 1;
    // Idle nearly silent so speaking passages never sticky-glow.
    const echoVis = traveling
      ? echoSmooth.current * (1 - echoTravel.current * 0.3)
      : echoSmooth.current * 0.04;

    gatherSmooth.current = smoothToward(
      gatherSmooth.current,
      Math.min(1, m.gather),
      dt,
      0.05,
      0.16,
    );
    kickSmooth.current = smoothToward(
      kickSmooth.current,
      Math.min(1.2, m.kick) * kitAmp,
      dt,
      0.018,
      0.14,
    );
    snareSmooth.current = smoothToward(
      snareSmooth.current,
      Math.min(1.2, m.snare) * kitAmp,
      dt,
      0.016,
      0.11,
    );
    hatSmooth.current = smoothToward(
      hatSmooth.current,
      Math.min(1.2, m.hat) * kitAmp,
      dt,
      0.012,
      0.055,
    );
    swellSmooth.current = smoothToward(
      swellSmooth.current,
      Math.min(1.2, 0.15 + m.swell * 0.85),
      dt,
      0.12,
      0.28,
    );
    tenderSmooth.current = smoothToward(
      tenderSmooth.current,
      Math.min(1, m.tenderness) * tenderAmp,
      dt,
      0.12,
      0.22,
    );
    afterglowSmooth.current = smoothToward(
      afterglowSmooth.current,
      Math.min(1, m.afterglow),
      dt,
      0.2,
      0.45,
    );

    let tensionTarget = Math.min(1, m.tension) * tensionAmp;
    if (m.dropEvent > 0.45 || m.release > 0.55) tensionTarget = 0;
    tensionSmooth.current = smoothToward(tensionSmooth.current, tensionTarget, dt, 0.1, 0.22);
    if (m.dropEvent > 0.45) {
      tensionSmooth.current = smoothToward(tensionSmooth.current, 0, dt, 0.04, 0.04);
    }
    const tension = tensionSmooth.current * (1 - stillness * 0.3);

    dropSmooth.current = smoothToward(
      dropSmooth.current,
      Math.min(1.35, m.dropEvent * 1.05 + m.impact * 0.2) * dropAmp,
      dt,
      0.03,
      0.55,
    );
    const drop = dropSmooth.current;
    if (drop > 0.45 && dropTravel.current >= 1) {
      dropTravel.current = 0;
      // Breach the koi nearest center for a readable splash.
      let best = 0;
      let bestR = 1e9;
      for (let i = 0; i < koiCount; i++) {
        const rr = radius.current[i]!;
        if (rr < bestR) {
          bestR = rr;
          best = i;
        }
      }
      breachIndex.current = best;
      const bx = pos.current[best * 3]!;
      const bz = pos.current[best * 3 + 2]!;
      spawnRipple(bx, bz, 1.25);
      spawnRipple(0, 0, 1.05);
    }
    if (dropTravel.current < 1) {
      const bpm = m.bpm && m.bpm > 30 ? m.bpm : 120;
      const beat = 60 / bpm;
      dropTravel.current = Math.min(1, dropTravel.current + (dt / (beat * 1.6)) * motionScale);
    }
    const dropPulse =
      dropTravel.current < 1
        ? Math.sin(Math.min(1, dropTravel.current) * Math.PI) * (1 - dropTravel.current * 0.35)
        : 0;

    const gather = gatherSmooth.current;
    const kick = kickSmooth.current * (1 - stillness * 0.85);
    const snare = snareSmooth.current * (1 - stillness * 0.85);
    const hat = hatSmooth.current * (1 - stillness * 0.95);
    const swell = swellSmooth.current;
    const tender = tenderSmooth.current;
    const afterglow = afterglowSmooth.current;

    // Draw nearer on leanIn — mild camera-ward pull toward the water surface.
    // Distinct from gather's center-curve inhale and tension's fast dark circling.
    const root = rootRef.current;
    if (root) {
      root.position.set(0, 0.35, 0.15 - lean * 0.55);
      root.scale.setScalar(1 + lean * 0.06);
    }

    // Kick edge → crisp ripple under a varying koi.
    if (kick > 0.42 && prevKick.current < 0.28) {
      const ki = Math.floor(hash01(timeRef.current * 17.3 + kick) * koiCount) % koiCount;
      spawnRipple(pos.current[ki * 3]!, pos.current[ki * 3 + 2]!, 0.55 + kick * 0.65);
    }
    prevKick.current = kick;

    // Advance ripples.
    const rip = ripples.current;
    for (let i = 0; i < RIPPLE_SLOTS; i++) {
      const base = i * 4;
      const age = rip[base + 3]!;
      const str = rip[base + 2]!;
      if (str > 0.001 && age < 1.4) {
        rip[base + 3] = age + dt * (0.55 + (1 - stillness) * 0.35);
      }
      rippleUniforms[i]!.set(rip[base]!, rip[base + 1]!, rip[base + 2]!, rip[base + 3]!);
    }

    const clock =
      dt *
      spd *
      motionScale *
      motionMul *
      (1 - tender * 0.55) *
      (1 + tension * 0.55) *
      (1 - lean * 0.22);
    timeRef.current += clock;

    scratchBass.current.set(palette.bass);
    scratchMid.current.set(palette.mid);
    scratchHigh.current.set(palette.high);
    const bassC = scratchBass.current;
    const midC = scratchMid.current;
    const highC = scratchHigh.current;
    const milkC = scratchMilk.current;
    const honeyC = scratchHoney.current;
    const warmC = scratchKoiWarm.current;
    const whiteC = scratchKoiWhite.current;
    const wakeC = scratchWake.current;
    const hushDim = 1 - stillness * 0.22;

    const aArr = angle.current;
    const rArr = radius.current;
    const sxArr = scatterX.current;
    const szArr = scatterZ.current;
    const tpArr = tailPhase.current;
    const pArr = pos.current;
    const hdgArr = heading.current;
    const lyArr = liftY.current;

    const snareGust = snare * 1.15;
    const scatterDecay = Math.exp(-dt / 0.22);
    const glowMesh = glowRef.current;

    for (let i = 0; i < koiCount; i++) {
      const i3 = i * 3;
      const seed = phases[i]!;
      const band = bands[i]!;
      const home = homeR[i]!;
      const osp = orbitSpd[i]!;

      // Gather / tension pull radii inward; lean approaches gently (not an inhale);
      // kick adds a brief outward then surge.
      const targetR =
        home *
        (1 - gather * 0.42 - tension * 0.38 - lean * 0.14) *
        (1 + kick * 0.06 * (0.5 + seed));
      rArr[i] = smoothToward(rArr[i]!, targetR, dt, 0.08, 0.14);

      const orbitRate =
        osp *
        (0.55 + swell * 0.35 + kick * 0.85 + tension * 0.95 + lean * 0.12) *
        (1 - gather * 0.25) *
        (1 - tender * 0.5);
      const dAng = orbitRate * clock * (1 + wander[i]! * 0.15);
      aArr[i] = wrapTau(aArr[i]! + dAng);

      // Soft organic wander on the radius.
      const wobble =
        Math.sin(timeRef.current * (0.55 + seed * 0.8) + i) * 0.08 * motionMul * (1 - gather);
      const rr = rArr[i]! + wobble;

      const gustSign = i % 2 === 0 ? 1 : -1;
      const bandMul = band === 1 ? 1.2 : band === 0 ? 0.85 : 1.0;
      sxArr[i] = sxArr[i]! * scatterDecay + snareGust * gustSign * bandMul * (0.55 + seed) * dt * 4.2;
      szArr[i] =
        szArr[i]! * scatterDecay +
        snareGust * (i % 3 === 0 ? 1 : -1) * 0.5 * bandMul * (0.45 + seed) * dt * 4.2;

      const ang = aArr[i]!;
      const x = Math.cos(ang) * rr + sxArr[i]!;
      const z = Math.sin(ang) * rr * 0.92 + szArr[i]!;

      // Lean rises koi toward the surface with expectation; breach lifts higher.
      let liftTarget = lean * 0.055;
      if (i === breachIndex.current && dropPulse > 0.05) {
        liftTarget = Math.max(liftTarget, dropPulse * 0.55);
      }
      lyArr[i] = smoothToward(lyArr[i]!, liftTarget, dt, 0.04, 0.12);
      const y = KOI_DEPTH + lyArr[i]!;

      // Heading from tangential orbit + scatter.
      const tang = osp >= 0 ? ang + Math.PI / 2 : ang - Math.PI / 2;
      const hx = Math.cos(tang) * Math.abs(osp) + sxArr[i]! * 2.5;
      const hz = Math.sin(tang) * Math.abs(osp) * 0.92 + szArr[i]! * 2.5;
      const yawTarget = Math.atan2(hx, hz);
      let yaw = hdgArr[i]!;
      let dyaw = yawTarget - yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      yaw = yaw + dyaw * Math.min(1, dt * (6 + kick * 4) * motionMul);
      hdgArr[i] = yaw;

      // Tail flick on kick.
      const tailRate = (6.5 + seed * 3.5 + kick * 10) * motionMul * motionScale;
      tpArr[i] = tpArr[i]! + dt * tailRate;
      const tail = Math.sin(tpArr[i]!) * (0.22 + kick * 0.35) * (1 - stillness * 0.95);

      pArr[i3] = x;
      pArr[i3 + 1] = y;
      pArr[i3 + 2] = z;

      const fishScale =
        (0.85 + sizes[i]! * 0.45) * (1 + kick * 0.05) * (1 + lyArr[i]! * 0.35);
      _dummy.position.set(x, y, z);
      _dummy.rotation.set(tail * 0.25, yaw, tail * 0.55, 'YXZ');
      _dummy.scale.set(1, 1, fishScale);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);

      if (glowMesh) {
        _dummy.position.set(x, y - 0.01, z);
        _dummy.scale.set(1.35, 1.1, fishScale * 1.15);
        _dummy.updateMatrix();
        glowMesh.setMatrixAt(i, _dummy.matrix);
      }

      const base = band === 0 ? bassC : band === 1 ? midC : highC;
      const pattern = band === 0 ? warmC : band === 1 ? whiteC : highC;
      _color
        .copy(base)
        .lerp(pattern, 0.45 + seed * 0.2)
        .lerp(honeyC, tender * 0.35)
        .lerp(milkC, tender * 0.2 + stillness * 0.15);
      const gain =
        (0.55 + kick * 0.25 + swell * 0.12 + hat * 0.08 + lyArr[i]! * 0.8 + lean * 0.22) *
        hushDim;
      _color.multiplyScalar(gain);
      mesh.setColorAt(i, _color);
      if (glowMesh) {
        _color.lerp(milkC, 0.2).multiplyScalar(0.85 + lean * 0.2);
        glowMesh.setColorAt(i, _color);
      }

      // Soft wake trail behind the koi.
      for (let w = 0; w < wakePer; w++) {
        const wi = (i * wakePer + w) * 3;
        const along = (w + 1) / wakePer;
        const back = along * (0.18 + sizes[i]! * 0.08);
        wakePositions[wi] = x - Math.sin(yaw) * back + Math.sin(tpArr[i]! + w) * 0.01;
        wakePositions[wi + 1] = WATER_Y + 0.01 - along * 0.01;
        wakePositions[wi + 2] = z - Math.cos(yaw) * back;
        const fade = (1 - along) * (0.35 + kick * 0.35 + afterglow * 0.15) * hushDim * motionMul;
        wakeColors[wi] = Math.min(1, wakeC.r * fade);
        wakeColors[wi + 1] = Math.min(1, wakeC.g * fade);
        wakeColors[wi + 2] = Math.min(1, wakeC.b * fade);
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (glowMesh) {
      glowMesh.instanceMatrix.needsUpdate = true;
      if (glowMesh.instanceColor) glowMesh.instanceColor.needsUpdate = true;
    }
    koiMat.opacity = Math.min(1, (0.82 + swell * 0.1 + lean * 0.06) * hushDim);
    glowMat.opacity = Math.min(
      0.55,
      (0.22 + kick * 0.12 + tender * 0.08 + lean * 0.16) * hushDim,
    );

    if (wakeRef.current) {
      const posAttr = wakeRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
      const colAttr = wakeRef.current.geometry.getAttribute('color') as THREE.BufferAttribute;
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    }
    if (wakeMatRef.current) {
      wakeMatRef.current.size = 0.04 + kick * 0.025;
      wakeMatRef.current.opacity = Math.min(0.75, (0.28 + kick * 0.25 + afterglow * 0.1) * hushDim);
    }

    // Hat surface glints — sparse dimples across the mirror.
    if (glintCount > 0) {
      for (let g = 0; g < glintCount; g++) {
        const g3 = g * 3;
        const seed = hash01(g * 2.718 + 0.2);
        const ang = seed * Math.PI * 2 + timeRef.current * 0.08 * (1 - stillness);
        const rad = 0.4 + hash01(g * 5.1) * 2.6;
        glintPositions[g3] = Math.cos(ang) * rad;
        glintPositions[g3 + 1] = WATER_Y + 0.03;
        glintPositions[g3 + 2] = Math.sin(ang) * rad * 0.92;
        const twinkle =
          Math.max(0, Math.sin(timeRef.current * (4 + seed * 5) + g)) *
          (0.2 + hat * 1.4) *
          (1 - stillness * 0.95);
        glintColors[g3] = Math.min(1, 0.75 * twinkle);
        glintColors[g3 + 1] = Math.min(1, 0.88 * twinkle);
        glintColors[g3 + 2] = Math.min(1, 1.0 * twinkle);
      }
      if (glintRef.current) {
        const posAttr = glintRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
        const colAttr = glintRef.current.geometry.getAttribute('color') as THREE.BufferAttribute;
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
      }
      if (glintMatRef.current) {
        glintMatRef.current.size = 0.028 + hat * 0.04;
        glintMatRef.current.opacity = Math.min(1, (0.15 + hat * 0.7) * hushDim);
      }
    }

    // Drop splash droplets around the breaching koi.
    const bi = breachIndex.current;
    const bx = pArr[bi * 3]!;
    const by = pArr[bi * 3 + 1]!;
    const bz = pArr[bi * 3 + 2]!;
    for (let s = 0; s < 24; s++) {
      const s3 = s * 3;
      const a = (s / 24) * Math.PI * 2;
      const rad = dropPulse * (0.15 + (s % 5) * 0.04);
      splashPositions[s3] = bx + Math.cos(a) * rad;
      splashPositions[s3 + 1] = Math.max(WATER_Y, by) + dropPulse * (0.12 + (s % 3) * 0.05);
      splashPositions[s3 + 2] = bz + Math.sin(a) * rad;
      const spark = dropPulse * (0.5 + (s % 2) * 0.35);
      splashColors[s3] = Math.min(1, 0.85 * spark);
      splashColors[s3 + 1] = Math.min(1, 0.92 * spark);
      splashColors[s3 + 2] = Math.min(1, 1.0 * spark);
    }
    if (splashRef.current) {
      const posAttr = splashRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
      const colAttr = splashRef.current.geometry.getAttribute('color') as THREE.BufferAttribute;
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    }
    if (splashMatRef.current) {
      splashMatRef.current.size = 0.035 + dropPulse * 0.05;
      splashMatRef.current.opacity = Math.min(1, dropPulse * 0.9);
    }

    // —— Phrase-echo ghost koi: one cool silver-blue memory gliding across ——
    const ghost = ghostRef.current;
    const ghostMat = ghostMatRef.current;
    if (ghost && ghostMat) {
      const seed = echoSeed.current;
      const travel = echoTravel.current;
      // Cross the pond on a BPM-paced path — retraces the gap's rhythm, then fades.
      const bpmEcho = m.bpm && m.bpm > 30 ? m.bpm : 120;
      const turns = Math.max(0.85, Math.min(1.45, bpmEcho / 95));
      const heading = seed * Math.PI * 2;
      const along = (travel - 0.5) * (4.8 + seed * 0.6);
      const lateral =
        Math.sin(travel * Math.PI * turns * 2 + seed * 8) * 0.22 * (traveling ? 1 : 0);
      const gx = Math.cos(heading) * along + Math.cos(heading + Math.PI / 2) * lateral;
      const gz =
        Math.sin(heading) * along * 0.92 + Math.sin(heading + Math.PI / 2) * lateral * 0.92;
      // Slightly deeper than live koi — memory under the black mirror.
      const gy = KOI_DEPTH - 0.025;
      const fade = traveling
        ? Math.sin(Math.min(1, travel) * Math.PI) * (1 - travel * 0.55)
        : 0;
      const ghostOpacity = Math.min(1, echoVis * fade * 0.95 * (1 - stillness * 0.55));
      ghost.visible = ghostOpacity > 0.01;
      // Face the glide direction (along increases with travel).
      const yaw = Math.atan2(Math.cos(heading), Math.sin(heading) * 0.92);
      if (ghost.visible) {
        const tail =
          Math.sin(travel * Math.PI * turns * 5 + seed * 14) * 0.28 * fade;
        ghost.position.set(gx, gy, gz);
        ghost.rotation.set(tail * 0.25, yaw, tail * 0.55, 'YXZ');
        ghost.scale.set(1.05, 1, 1.15 + fade * 0.1);
        ghostMat.color.copy(GHOST_SILVER).multiplyScalar(0.55 + fade * 0.65);
        ghostMat.opacity = ghostOpacity;
      }

      // Pale wake trailing the ghost — distinct from live koi wakes.
      const gWakePos = ghostWakePositions;
      const gWakeCol = ghostWakeColors;
      const gWakePts = ghostWakeRef.current;
      const gWakeMat = ghostWakeMatRef.current;
      for (let w = 0; w < GHOST_WAKE; w++) {
        const wi = w * 3;
        const alongTrail = (w + 1) / GHOST_WAKE;
        const back = alongTrail * (0.22 + fade * 0.12);
        gWakePos[wi] = gx - Math.sin(yaw) * back;
        gWakePos[wi + 1] = WATER_Y + 0.005 - alongTrail * 0.008;
        gWakePos[wi + 2] = gz - Math.cos(yaw) * back;
        const trailFade =
          ghostOpacity * (1 - alongTrail) * (0.55 + fade * 0.45) * (traveling ? 1 : 0.15);
        gWakeCol[wi] = Math.min(1, GHOST_SILVER.r * trailFade);
        gWakeCol[wi + 1] = Math.min(1, GHOST_SILVER.g * trailFade);
        gWakeCol[wi + 2] = Math.min(1, GHOST_SILVER.b * trailFade);
      }
      if (gWakePts) {
        const posAttr = gWakePts.geometry.getAttribute('position') as THREE.BufferAttribute;
        const colAttr = gWakePts.geometry.getAttribute('color') as THREE.BufferAttribute;
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
        gWakePts.visible = ghostOpacity > 0.02;
      }
      if (gWakeMat) {
        gWakeMat.size = 0.035 + fade * 0.03;
        gWakeMat.opacity = Math.min(0.85, ghostOpacity * 0.75);
      }
    }

    // Water uniforms.
    const wMat = waterMatRef.current;
    if (wMat) {
      wMat.uniforms.uTime!.value = timeRef.current;
      wMat.uniforms.uStillness!.value = stillness;
      wMat.uniforms.uTenderness!.value = tender;
      wMat.uniforms.uTension!.value = tension;
      wMat.uniforms.uHat!.value = hat;
      wMat.uniforms.uSwell!.value = swell;
      wMat.uniforms.uAfterglow!.value = afterglow;
      wMat.uniforms.uMoonWiden!.value = tender;
      wMat.uniforms.uGlass!.value = glass;
      (wMat.uniforms.uColorBass!.value as THREE.Color).copy(bassC);
      (wMat.uniforms.uColorMid!.value as THREE.Color).copy(midC);
      (wMat.uniforms.uColorHigh!.value as THREE.Color).copy(highC);
      (wMat.uniforms.uMoon!.value as THREE.Color).copy(scratchMoon.current).lerp(milkC, tender * 0.55);
    }
  });

  const waterUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uStillness: { value: 0 },
      uTenderness: { value: 0 },
      uTension: { value: 0 },
      uHat: { value: 0 },
      uSwell: { value: 0.15 },
      uAfterglow: { value: 0 },
      uMoonWiden: { value: 0 },
      uGlass: { value: 0 },
      uColorBass: { value: new THREE.Color('#1a2a4a') },
      uColorMid: { value: new THREE.Color('#2a4a6a') },
      uColorHigh: { value: new THREE.Color('#7ab0d8') },
      uMoon: { value: new THREE.Color(0.72, 0.82, 0.98) },
      uRipples: { value: rippleUniforms },
    }),
    [rippleUniforms],
  );

  return (
    // Tip the pond toward the camera so the composition reads top-down,
    // distinct from Paper Lanterns' side-on flotilla.
    <group ref={rootRef} rotation={[-1.12, 0.08, 0.04]} position={[0, 0.35, 0.15]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_Y, 0]}>
        <circleGeometry args={[3.55, waterSegs]} />
        <shaderMaterial
          ref={waterMatRef}
          transparent
          depthWrite={false}
          toneMapped={false}
          vertexShader={waterVert}
          fragmentShader={waterFrag}
          uniforms={waterUniforms}
        />
      </mesh>

      <instancedMesh ref={glowRef} args={[glowGeo, glowMat, koiCount]} frustumCulled={false} />
      <instancedMesh ref={koiRef} args={[koiGeo, koiMat, koiCount]} frustumCulled={false} />

      {/* Phrase-echo ghost koi — cool silver-blue memory gliding beneath the surface. */}
      <mesh ref={ghostRef} geometry={koiGeo} visible={false} frustumCulled={false}>
        <meshBasicMaterial
          ref={ghostMatRef}
          color={GHOST_SILVER}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <points ref={ghostWakeRef} visible={false}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[ghostWakePositions, 3]}
            count={GHOST_WAKE}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[ghostWakeColors, 3]}
            count={GHOST_WAKE}
          />
        </bufferGeometry>
        <pointsMaterial
          ref={ghostWakeMatRef}
          size={0.035}
          map={sprite}
          sizeAttenuation
          transparent
          depthWrite={false}
          toneMapped={false}
          vertexColors
          blending={THREE.AdditiveBlending}
          opacity={0}
        />
      </points>

      <points ref={wakeRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[wakePositions, 3]} count={wakeCount} />
          <bufferAttribute attach="attributes-color" args={[wakeColors, 3]} count={wakeCount} />
        </bufferGeometry>
        <pointsMaterial
          ref={wakeMatRef}
          size={0.04}
          map={sprite}
          sizeAttenuation
          transparent
          depthWrite={false}
          toneMapped={false}
          vertexColors
          blending={THREE.AdditiveBlending}
          opacity={0.35}
        />
      </points>

      {glintCount > 0 ? (
        <points ref={glintRef}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[glintPositions, 3]}
              count={glintCount}
            />
            <bufferAttribute
              attach="attributes-color"
              args={[glintColors, 3]}
              count={glintCount}
            />
          </bufferGeometry>
          <pointsMaterial
            ref={glintMatRef}
            size={0.03}
            map={sprite}
            sizeAttenuation
            transparent
            depthWrite={false}
            toneMapped={false}
            vertexColors
            blending={THREE.AdditiveBlending}
            opacity={0.4}
          />
        </points>
      ) : null}

      <points ref={splashRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[splashPositions, 3]}
            count={24}
          />
          <bufferAttribute attach="attributes-color" args={[splashColors, 3]} count={24} />
        </bufferGeometry>
        <pointsMaterial
          ref={splashMatRef}
          size={0.04}
          map={sprite}
          sizeAttenuation
          transparent
          depthWrite={false}
          toneMapped={false}
          vertexColors
          blending={THREE.AdditiveBlending}
          opacity={0}
        />
      </points>
    </group>
  );
}
