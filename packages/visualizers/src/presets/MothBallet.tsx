'use client';

/**
 * Moth Ballet — a lone candle flame in total darkness, circled by moths
 * in lagged, banked orbits whose wings catch the light.
 * Musical anatomy:
 *  - kick → flame flare + surge of moths inward toward the light
 *  - snare → lateral scatter gust through the swarm
 *  - hat → wing glints as moths cross the lit face of the flame
 *  - gather → tightens orbits on a pre-beat inhale
 *  - tension → gutters the flame taller + compresses the spiral
 *  - dropEvent → one-shot flame burst; moths scatter wide then re-gather
 *  - leanIn → tighten orbits + draw ballet nearer; flame leans taller with expectation
 *  - echo → one-shot cool silver-blue ghost moth retracing the gap's rhythm
 *  - tenderness → honey-warm light + slowed ballet
 *  - holdBreath / deep silence → hang mid-wingbeat; flame steadies to a still point
 *
 * Distinct from Paper Lanterns (many flames over water) and Murmuration
 * (dusk flock with no flame center) — one fire, creatures orbiting it.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';
import { getDotTexture } from '../dotTexture';

const COUNT_HIGH = 220;
const COUNT_MID = 110;
const COUNT_LOW = 48;

const GLINT_HIGH = 90;
const GLINT_MID = 40;
const GLINT_LOW = 0;

/** Soft candle core / mid / outer halo colors. */
const FLAME_CORE = /* @__PURE__ */ new THREE.Color(1.0, 0.92, 0.62);
const FLAME_MID = /* @__PURE__ */ new THREE.Color(1.0, 0.55, 0.18);
const FLAME_HALO = /* @__PURE__ */ new THREE.Color(1.0, 0.32, 0.08);
const HONEY = /* @__PURE__ */ new THREE.Color(1.0, 0.72, 0.38);
const VOID = /* @__PURE__ */ new THREE.Color(0.01, 0.008, 0.02);
const MOTH_BASE = /* @__PURE__ */ new THREE.Color(0.55, 0.48, 0.42);
/** Cool silver-blue — phrase-memory ghost, cooler than candle honey / kick flare. */
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

export function MothBalletScene({ analyser, palette, tier, speed = 1 }: VisualizerSceneProps) {
  const mods = useModulation();
  const rootRef = useRef<THREE.Group>(null);
  const flameRef = useRef<THREE.Group>(null);
  const coreMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const midMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const haloMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const mothRef = useRef<THREE.InstancedMesh>(null);
  const ghostRef = useRef<THREE.Mesh>(null);
  const ghostMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const ghostGlintRef = useRef<THREE.Points>(null);
  const ghostGlintMatRef = useRef<THREE.PointsMaterial>(null);
  const glintRef = useRef<THREE.Points>(null);
  const glintMatRef = useRef<THREE.PointsMaterial>(null);
  const voidMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();

  const mothCount = tier === 'high' ? COUNT_HIGH : tier === 'mid' ? COUNT_MID : COUNT_LOW;
  const glintCount = tier === 'high' ? GLINT_HIGH : tier === 'mid' ? GLINT_MID : GLINT_LOW;
  // Low skips outer halo shell + wing glints — cheaper candle, coarser moths.
  // Ghost moth always renders (one mesh); ghost wing glints skip on low.
  const showOuterHalo = tier !== 'low';
  const showGhostGlints = tier !== 'low';
  const mothSegs = tier === 'high' ? 4 : 3;
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
  const scratchFlameMid = useRef(new THREE.Color().copy(FLAME_MID));
  const scratchFlame = useRef(new THREE.Color().copy(FLAME_CORE));
  const scratchHalo = useRef(new THREE.Color().copy(FLAME_HALO));
  const scratchGlint = useRef(new THREE.Color().copy(FLAME_CORE));

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
  // One-shot drop scatter travel 0..1; >=1 idle.
  const dropTravel = useRef(1);
  // LeanIn anticipation: eager climb, slower release into the drop.
  const leanSmooth = useRef(0);
  // Phrase-echo one-shot: arm on quiet, fire one cool ghost moth per gap.
  const echoSmooth = useRef(0);
  const echoTravel = useRef(1); // 0..1 traveling; >=1 idle
  const echoArmed = useRef(true);
  const prevEcho = useRef(0);
  const echoSeed = useRef(0.37);
  const timeRef = useRef(0);

  // Per-moth orbital state — radius / angle / lag / bank / wing phase.
  const radius = useRef(new Float32Array(mothCount));
  const angle = useRef(new Float32Array(mothCount));
  const lagAngle = useRef(new Float32Array(mothCount));
  const height = useRef(new Float32Array(mothCount));
  const bank = useRef(new Float32Array(mothCount));
  const wing = useRef(new Float32Array(mothCount));
  const scatterX = useRef(new Float32Array(mothCount));
  const scatterZ = useRef(new Float32Array(mothCount));
  const pos = useRef(new Float32Array(mothCount * 3));

  const sprite = useMemo(() => getDotTexture(), []);

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const { phases, sizes, bands, homeR, orbitSpd, glintOf } = useMemo(() => {
    const rArr = radius.current;
    const aArr = angle.current;
    const lArr = lagAngle.current;
    const hArr = height.current;
    const bArr = bank.current;
    const wArr = wing.current;
    const sx = scatterX.current;
    const sz = scatterZ.current;
    const p = pos.current;

    const ph = new Float32Array(mothCount);
    const szArr = new Float32Array(mothCount);
    const b = new Uint8Array(mothCount);
    const hr = new Float32Array(mothCount);
    const osp = new Float32Array(mothCount);
    const gOf = new Int32Array(Math.max(glintCount, 1));

    for (let i = 0; i < mothCount; i++) {
      const seed = i * 1.6180339887;
      // Soft nested shells — denser near the flame, sparse outer ballet.
      const shell = Math.sqrt(hash01(seed + 0.11));
      const home = 0.55 + shell * 2.65;
      hr[i] = home;
      rArr[i] = home;
      aArr[i] = hash01(seed + 0.37) * Math.PI * 2;
      // Lagged banked orbits — each moth trails its own phase a little.
      lArr[i] = aArr[i]! - (0.08 + hash01(seed + 0.55) * 0.35);
      hArr[i] = (hash01(seed + 0.71) - 0.42) * 1.85;
      bArr[i] = 0;
      wArr[i] = hash01(seed + 1.1) * Math.PI * 2;
      sx[i] = 0;
      sz[i] = 0;
      osp[i] = 0.55 + hash01(seed + 1.7) * 0.95;
      ph[i] = hash01(seed + 2.3);
      b[i] = i % 3;
      szArr[i] = 0.7 + hash01(seed + 2.9) * 0.75;

      const ang = lArr[i]!;
      p[i * 3] = Math.cos(ang) * home;
      p[i * 3 + 1] = hArr[i]!;
      p[i * 3 + 2] = Math.sin(ang) * home * 0.92;
    }

    for (let g = 0; g < glintCount; g++) {
      gOf[g] = Math.floor(hash01(g * 2.718 + 0.2) * mothCount) % mothCount;
    }

    radius.current = rArr;
    angle.current = aArr;
    lagAngle.current = lArr;
    height.current = hArr;
    bank.current = bArr;
    wing.current = wArr;
    scatterX.current = sx;
    scatterZ.current = sz;
    pos.current = p;

    return { phases: ph, sizes: szArr, bands: b, homeR: hr, orbitSpd: osp, glintOf: gOf };
  }, [mothCount, glintCount]);

  const glintPositions = useMemo(
    () => new Float32Array(Math.max(glintCount, 1) * 3),
    [glintCount],
  );
  const glintColors = useMemo(
    () => new Float32Array(Math.max(glintCount, 1) * 3),
    [glintCount],
  );
  // Two pale wing-tip glints for the ghost moth (skipped on low).
  const ghostGlintPositions = useMemo(() => new Float32Array(2 * 3), []);
  const ghostGlintColors = useMemo(() => new Float32Array(2 * 3), []);

  // Flat diamond moth body — tip along −Z so yaw faces the flame.
  const mothGeo = useMemo(() => {
    const geo = new THREE.ConeGeometry(0.038, 0.095, mothSegs);
    geo.rotateX(-Math.PI / 2);
    geo.scale(1.55, 0.35, 1);
    return geo;
  }, [mothSegs]);

  const mothMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  useFrame((_state, delta) => {
    const mesh = mothRef.current;
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
    const hatMul = 1 - stillness * 0.95;

    // LeanIn: fast climb into anticipation, slower release into the drop.
    // Soft under holdBreath so approach still reads through hush.
    // Distinct from gather (pre-beat inhale) and tension (gutter + compress).
    leanSmooth.current = smoothToward(
      leanSmooth.current,
      Math.min(1, m.leanIn) * leanAmp,
      dt,
      0.06,
      0.18,
    );
    const lean = leanSmooth.current * (1 - stillness * 0.35);

    // Phrase-echo: arm on quiet, fire one cool silver ghost moth per gap.
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

    // Tension: gutters taller + spiral compress; spring-loose on drop/release.
    let tensionTarget = Math.min(1, m.tension) * tensionAmp;
    if (m.dropEvent > 0.45 || m.release > 0.55) tensionTarget = 0;
    tensionSmooth.current = smoothToward(
      tensionSmooth.current,
      tensionTarget,
      dt,
      0.1,
      0.22,
    );
    if (m.dropEvent > 0.45) {
      tensionSmooth.current = smoothToward(tensionSmooth.current, 0, dt, 0.04, 0.04);
    }
    const tension = tensionSmooth.current * (1 - stillness * 0.3);

    // Drop: one-shot flame burst + moth scatter travel.
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
    }
    if (dropTravel.current < 1) {
      const bpm = m.bpm && m.bpm > 30 ? m.bpm : 120;
      const beatSec = 60 / bpm;
      dropTravel.current = Math.min(
        1,
        dropTravel.current + (dt / (beatSec * 2.1)) * (0.85 + spd * 0.2),
      );
    }
    const dropping = dropTravel.current < 1;
    const dropPulse = dropping ? Math.sin(dropTravel.current * Math.PI) : 0;

    const gather = gatherSmooth.current;
    const kick = kickSmooth.current;
    const snare = snareSmooth.current;
    const hat = hatSmooth.current * hatMul;
    const tender = tenderSmooth.current;
    const afterglow = afterglowSmooth.current;
    const swell = swellSmooth.current;
    const calm = 1 - tender * 0.5;
    const hushDim = 1 - stillness * 0.28;

    // Draw nearer on leanIn — mild camera-ward pull, distinct from gather inhale.
    const root = rootRef.current;
    if (root) {
      root.position.z = -lean * 0.55;
      const leanScale = 1 + lean * 0.06;
      root.scale.setScalar(leanScale);
    }

    // Ballet clock — freezes under holdBreath; tenderness slows without stopping.
    // Lean hush: slightly quieter freewheel (expectant still), not a freeze.
    timeRef.current +=
      dt *
      spd *
      (0.55 + Math.min(m.energy, 1.5) * 0.35) *
      calm *
      motionMul *
      motionScale *
      (1 - tension * 0.18) *
      (1 - lean * 0.22);
    const t = timeRef.current;

    // —— Flame: candle core + warm mid + soft outer halo ——
    const flame = flameRef.current;
    if (flame) {
      // Kick flares; tension gutters taller; lean leans taller with expectation;
      // drop bursts once; stillness steadies.
      const flare =
        1 + kick * 0.55 + dropPulse * 0.85 + swell * 0.08 + lean * 0.08;
      const tall =
        1 + tension * 0.55 + kick * 0.12 + dropPulse * 0.35 + lean * 0.28;
      const steady = 1 - stillness * 0.35;
      flame.scale.set(flare * (0.92 + steady * 0.08), tall * flare * 0.95, flare);
      flame.position.y = 0.12 + tension * 0.18 + kick * 0.04 + lean * 0.1;
      // Soft flicker — nearly gone under hush so the still point reads.
      const flicker =
        (1 - stillness * 0.92) *
        (0.012 + Math.sin(t * 11.3) * 0.01 + Math.sin(t * 17.7) * 0.006) *
        (1 - tender * 0.35) *
        (1 - lean * 0.35);
      flame.position.x = flicker;
      flame.position.z = flicker * 0.7;
    }

    const coreC = scratchFlame.current.copy(FLAME_CORE).lerp(HONEY, tender * 0.45 + afterglow * 0.12);
    const midC = scratchFlameMid.current.copy(FLAME_MID).lerp(HONEY, tender * 0.5);
    const haloC = scratchHalo.current.copy(FLAME_HALO).lerp(HONEY, tender * 0.4);
    // Tension darkens the gutter slightly (taller, hungrier).
    if (tension > 0.01) {
      coreC.multiplyScalar(1 - tension * 0.12);
      midC.multiplyScalar(1 - tension * 0.08);
    }
    const flameGain =
      (0.85 +
        kick * 0.55 +
        dropPulse * 0.7 +
        swell * 0.15 +
        afterglow * 0.1 +
        lean * 0.18) *
      hushDim;
    if (coreMatRef.current) {
      coreMatRef.current.color.copy(coreC).multiplyScalar(flameGain);
      coreMatRef.current.opacity = Math.min(1, 0.95 * hushDim);
    }
    if (midMatRef.current) {
      midMatRef.current.color.copy(midC).multiplyScalar(flameGain * 0.9);
      midMatRef.current.opacity = Math.min(
        1,
        (0.55 + kick * 0.25 + dropPulse * 0.3 + lean * 0.12) * hushDim,
      );
    }
    if (haloMatRef.current) {
      haloMatRef.current.color.copy(haloC).multiplyScalar(flameGain * 0.7);
      haloMatRef.current.opacity = Math.min(
        1,
        (0.28 + kick * 0.2 + dropPulse * 0.35 + tension * 0.08 + lean * 0.1) * hushDim,
      );
    }

    // Palette for moth bodies — moths catch warm light near the flame.
    const bassC = scratchBass.current.set(palette.bass).lerp(MOTH_BASE, 0.55);
    const midBandC = scratchMid.current.set(palette.mid).lerp(MOTH_BASE, 0.45);
    const highC = scratchHigh.current.set(palette.high).lerp(FLAME_CORE, 0.25);
    if (tender > 0.001) {
      bassC.lerp(HONEY, tender * 0.45);
      midBandC.lerp(HONEY, tender * 0.4);
      highC.lerp(HONEY, tender * 0.35);
    }

    const rArr = radius.current;
    const aArr = angle.current;
    const lArr = lagAngle.current;
    const hArr = height.current;
    const bArr = bank.current;
    const wArr = wing.current;
    const sxArr = scatterX.current;
    const szArr = scatterZ.current;
    const pArr = pos.current;

    // Orbit radius targets: gather inhale + tension compress + lean approach + kick surge in.
    // lean tighten (~0.18) is gentler than gather (0.42) / tension (0.32) — approach, not inhale.
    const gatherTighten = 1 - gather * 0.42;
    const tensionTighten = 1 - tension * 0.32;
    const leanTighten = 1 - lean * 0.18;
    const kickSurge = 1 - kick * 0.38;
    // Drop scatter: expand then settle (pulse envelope).
    const dropScatter = 1 + dropPulse * 1.15;
    const radiusMul = gatherTighten * tensionTighten * leanTighten * kickSurge * dropScatter;
    const radiusInertia = 1 - Math.exp(-dt / Math.max(0.05, 0.12 + tender * 0.06));
    const lagInertia = 1 - Math.exp(-dt / 0.11);
    const bankInertia = 1 - Math.exp(-dt / 0.09);
    const scatterDecay = Math.exp(-dt / Math.max(0.08, 0.18 - snare * 0.06));

    // Snare lateral gust — impulse into scatter buffers (not position snap).
    const snareGust = snare * dt * 5.2 * (1 - stillness * 0.85);

    for (let i = 0; i < mothCount; i++) {
      const i3 = i * 3;
      const seed = phases[i]!;
      const band = bands[i]!;
      const home = homeR[i]!;

      // Desired orbital radius — home shell scaled by musical compress/expand.
      const targetR = home * radiusMul * (0.92 + swell * 0.08);
      rArr[i] = rArr[i]! + (targetR - rArr[i]!) * radiusInertia;

      // Angular drive — tenderness slows; hush nearly freezes; tension coils;
      // lean quickens a whisper (expectant spiral).
      const orbitRate =
        orbitSpd[i]! *
        (0.55 + spd * 0.45) *
        calm *
        motionMul *
        motionScale *
        (1 + gather * 0.15) *
        (1 + tension * 0.22) *
        (1 + lean * 0.12);
      aArr[i] = wrapTau(aArr[i]! + dt * orbitRate);

      // Lagged follow — banked ballet; each moth trails its lead angle.
      const lagTarget = aArr[i]! - (0.1 + seed * 0.28) * (1 - gather * 0.35);
      let lag = lArr[i]!;
      // Unwrap shortest path so lag doesn't jump across 2π.
      let dLag = lagTarget - lag;
      while (dLag > Math.PI) dLag -= Math.PI * 2;
      while (dLag < -Math.PI) dLag += Math.PI * 2;
      lag += dLag * lagInertia;
      lArr[i] = lag;

      // Soft vertical bob — freezes mid-wingbeat under holdBreath.
      const bob =
        Math.sin(t * (0.7 + seed * 1.4) + seed * 12.0) *
        0.12 *
        calm *
        motionMul *
        (1 - gather * 0.25);
      const y = hArr[i]! * (1 - gather * 0.2 - tension * 0.12) + bob;

      // Snare scatter into lateral buffers; decay with inertia.
      const gustSign = i % 2 === 0 ? 1 : -1;
      const bandMul = band === 1 ? 1.2 : band === 0 ? 0.85 : 1.0;
      sxArr[i] = sxArr[i]! * scatterDecay + snareGust * gustSign * bandMul * (0.6 + seed);
      szArr[i] =
        szArr[i]! * scatterDecay +
        snareGust * (i % 3 === 0 ? 1 : -1) * 0.55 * bandMul * (0.5 + seed);

      // Drop scatter adds a radial outward kick once per travel crest.
      if (dropping && dropPulse > 0.2) {
        const outward = dropPulse * dt * 2.8 * (0.7 + seed);
        sxArr[i] = sxArr[i]! + Math.cos(lag) * outward;
        szArr[i] = szArr[i]! + Math.sin(lag) * outward;
      }

      const rr = rArr[i]!;
      const x = Math.cos(lag) * rr + sxArr[i]!;
      const z = Math.sin(lag) * rr * 0.92 + szArr[i]!;

      pArr[i3] = x;
      pArr[i3 + 1] = y;
      pArr[i3 + 2] = z;

      // Face the flame (origin) with banked turns from angular velocity.
      const toFlameX = -x;
      const toFlameZ = -z;
      const yaw = Math.atan2(toFlameX, toFlameZ);
      const turn = dLag / Math.max(dt, 1e-4);
      const bankTarget = Math.max(
        -1.05,
        Math.min(1.05, -turn * 0.18 * (1 + gather * 0.4 + tension * 0.25)),
      );
      bArr[i] = bArr[i]! + (bankTarget - bArr[i]!) * bankInertia;
      if (stillness > 0.01) {
        bArr[i] = bArr[i]! * (1 - stillness * 0.1);
      }

      // Wingbeat — hangs mid-flap under holdBreath.
      const wingRate = (7.5 + seed * 4.5) * calm * motionMul * motionScale;
      wArr[i] = wArr[i]! + dt * wingRate;
      const wingFlap = Math.sin(wArr[i]!) * (0.35 + hat * 0.15) * (1 - stillness * 0.95);

      // Light catch: nearer moths read warmer; wing-phase brightens the lit face.
      const dist = Math.sqrt(x * x + z * z) + 1e-4;
      const nearness = Math.max(0, 1 - dist / 3.4);
      const litFace = 0.35 + Math.max(0, Math.sin(wArr[i]!)) * 0.65;
      const catchLight = nearness * litFace;

      const birdScale =
        (0.8 + sizes[i]! * 0.4) *
        (1 + kick * 0.06 * nearness) *
        (1 + dropPulse * 0.05);
      _dummy.position.set(x, y, z);
      _dummy.rotation.set(wingFlap * 0.35, yaw, bArr[i]! + wingFlap * 0.55, 'YXZ');
      _dummy.scale.set(1 + Math.abs(wingFlap) * 0.45, 1, birdScale);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);

      const base = band === 0 ? bassC : band === 1 ? midBandC : highC;
      const gain =
        (0.45 + catchLight * 0.85 + hat * 0.2 * catchLight + kick * 0.12 * nearness) *
        hushDim *
        (0.85 + swell * 0.15);
      _color.copy(base).lerp(FLAME_CORE, catchLight * 0.55).multiplyScalar(gain);
      if (tender > 0.001) _color.lerp(HONEY, tender * 0.25 * catchLight);
      mesh.setColorAt(i, _color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mothMat.opacity = Math.min(1, (0.78 + swell * 0.12 + afterglow * 0.08) * hushDim);

    // —— Phrase-echo ghost moth: one cool silver-blue memory circling the flame ——
    const ghost = ghostRef.current;
    const ghostMat = ghostMatRef.current;
    if (ghost && ghostMat) {
      const seed = echoSeed.current;
      const travel = echoTravel.current;
      // BPM-paced orbit count — retraces the gap's rhythm, then fades.
      const bpmEcho = m.bpm && m.bpm > 30 ? m.bpm : 120;
      const turns = Math.max(1.35, Math.min(2.6, bpmEcho / 70));
      const ang = seed * Math.PI * 2 + travel * Math.PI * 2 * turns;
      const ghostR = 1.15 + seed * 0.55;
      const gx = Math.cos(ang) * ghostR;
      const gz = Math.sin(ang) * ghostR * 0.92;
      const gy =
        (seed - 0.42) * 0.85 +
        Math.sin(travel * Math.PI * turns * 2 + seed * 6) * 0.08 * (traveling ? 1 : 0);
      const fade = traveling
        ? Math.sin(Math.min(1, travel) * Math.PI) * (1 - travel * 0.55)
        : 0;
      const ghostOpacity = Math.min(1, echoVis * fade * 0.95 * (1 - stillness * 0.55));
      ghost.visible = ghostOpacity > 0.01;
      if (ghost.visible) {
        const yaw = Math.atan2(-gx, -gz);
        const wingFlap =
          Math.sin(travel * Math.PI * turns * 6 + seed * 14) * 0.32 * fade;
        ghost.position.set(gx, gy, gz);
        ghost.rotation.set(wingFlap * 0.35, yaw, wingFlap * 0.55, 'YXZ');
        ghost.scale.set(1.15 + Math.abs(wingFlap) * 0.4, 1, 1.05);
        ghostMat.color.copy(GHOST_SILVER).multiplyScalar(0.55 + fade * 0.65);
        ghostMat.opacity = ghostOpacity;
      }

      // Pale wing-tip glints ride the ghost (mid/high only).
      if (showGhostGlints) {
        const gPos = ghostGlintPositions;
        const gCol = ghostGlintColors;
        const gPoints = ghostGlintRef.current;
        const gMat = ghostGlintMatRef.current;
        const wing = 0.07;
        const yaw = Math.atan2(-gx, -gz);
        for (let g = 0; g < 2; g++) {
          const side = g === 0 ? 1 : -1;
          const g3 = g * 3;
          gPos[g3] = gx + Math.cos(yaw + Math.PI / 2) * wing * side;
          gPos[g3 + 1] = gy + 0.01;
          gPos[g3 + 2] = gz + Math.sin(yaw + Math.PI / 2) * wing * side;
          const spark = ghostOpacity * (0.55 + fade * 0.7);
          gCol[g3] = Math.min(1, GHOST_SILVER.r * spark);
          gCol[g3 + 1] = Math.min(1, GHOST_SILVER.g * spark);
          gCol[g3 + 2] = Math.min(1, GHOST_SILVER.b * spark);
        }
        if (gPoints) {
          const posAttr = gPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
          const colAttr = gPoints.geometry.getAttribute('color') as THREE.BufferAttribute;
          posAttr.needsUpdate = true;
          colAttr.needsUpdate = true;
          gPoints.visible = ghostOpacity > 0.02;
        }
        if (gMat) {
          gMat.size = 0.028 + fade * 0.04;
          gMat.opacity = Math.min(1, ghostOpacity * 0.85);
        }
      }
    }

    // Wing glints — wink when selected moths cross the lit face (hat-driven).
    if (glintCount > 0) {
      const gPos = glintPositions;
      const gCol = glintColors;
      const glints = glintRef.current;
      const gMat = glintMatRef.current;
      for (let g = 0; g < glintCount; g++) {
        const bi = glintOf[g]!;
        const i3 = bi * 3;
        const g3 = g * 3;
        const x = pArr[i3]!;
        const y = pArr[i3 + 1]!;
        const z = pArr[i3 + 2]!;
        const yaw = Math.atan2(-x, -z);
        const wing = 0.06 + sizes[bi]! * 0.025;
        gPos[g3] = x + Math.cos(yaw + Math.PI / 2) * wing * (g % 2 === 0 ? 1 : -1);
        gPos[g3 + 1] = y + bArr[bi]! * 0.02;
        gPos[g3 + 2] = z + Math.sin(yaw + Math.PI / 2) * wing * (g % 2 === 0 ? 1 : -1);

        const dist = Math.sqrt(x * x + z * z) + 1e-4;
        const nearness = Math.max(0, 1 - dist / 3.2);
        const cross =
          nearness *
          Math.max(0, Math.sin(lArr[bi]! * 2.0 + phases[bi]! * 6.0)) *
          (0.35 + hat * 1.4);
        const spark = cross * (0.4 + hat * 1.2 + kick * 0.25 * nearness);
        const gc = scratchGlint.current.copy(FLAME_CORE).lerp(HONEY, tender * 0.4);
        gCol[g3] = Math.min(1, gc.r * spark);
        gCol[g3 + 1] = Math.min(1, gc.g * spark);
        gCol[g3 + 2] = Math.min(1, gc.b * spark);
      }
      if (glints) {
        const posAttr = glints.geometry.getAttribute('position') as THREE.BufferAttribute;
        const colAttr = glints.geometry.getAttribute('color') as THREE.BufferAttribute;
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
      }
      if (gMat) {
        gMat.size = 0.03 + hat * 0.05 + kick * 0.02;
        gMat.opacity = Math.min(1, (0.25 + hat * 0.6 + m.shimmer * 0.12) * hushDim);
      }
    }

    if (voidMatRef.current) {
      voidMatRef.current.color.copy(VOID).lerp(HONEY, tender * 0.04 + afterglow * 0.03);
      voidMatRef.current.opacity = 0.55 * hushDim;
    }
  });

  return (
    <group ref={rootRef}>
      {/* Soft void disc — total darkness under the candle, not a card. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.9, 0]}>
        <circleGeometry args={[7.2, 48]} />
        <meshBasicMaterial
          ref={voidMatRef}
          color={VOID}
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </mesh>

      {/* Lone candle — core / mid / outer halo. */}
      <group ref={flameRef} position={[0, 0.12, 0]}>
        <mesh>
          <sphereGeometry args={[0.09, 16, 16]} />
          <meshBasicMaterial
            ref={coreMatRef}
            color={FLAME_CORE}
            transparent
            opacity={0.95}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <mesh scale={[1.8, 2.2, 1.8]}>
          <sphereGeometry args={[0.09, 12, 12]} />
          <meshBasicMaterial
            ref={midMatRef}
            color={FLAME_MID}
            transparent
            opacity={0.55}
            depthWrite={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        {showOuterHalo ? (
          <mesh scale={[3.4, 4.2, 3.4]}>
            <sphereGeometry args={[0.09, 10, 10]} />
            <meshBasicMaterial
              ref={haloMatRef}
              color={FLAME_HALO}
              transparent
              opacity={0.28}
              depthWrite={false}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        ) : null}
      </group>

      <instancedMesh
        ref={mothRef}
        args={[mothGeo, mothMat, mothCount]}
        frustumCulled={false}
      />

      {/* Phrase-echo ghost moth — cool silver-blue memory circling the flame. */}
      <mesh ref={ghostRef} geometry={mothGeo} visible={false} frustumCulled={false}>
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

      {showGhostGlints ? (
        <points ref={ghostGlintRef} visible={false}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[ghostGlintPositions, 3]}
              count={2}
            />
            <bufferAttribute
              attach="attributes-color"
              args={[ghostGlintColors, 3]}
              count={2}
            />
          </bufferGeometry>
          <pointsMaterial
            ref={ghostGlintMatRef}
            size={0.03}
            map={sprite}
            sizeAttenuation
            transparent
            vertexColors
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      ) : null}

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
            size={0.035}
            map={sprite}
            sizeAttenuation
            transparent
            vertexColors
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      ) : null}
    </group>
  );
}
