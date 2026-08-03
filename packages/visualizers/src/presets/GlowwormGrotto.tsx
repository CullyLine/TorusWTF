'use client';

/**
 * Glowworm Grotto — dark limestone cavern ceiling hung with bioluminescent
 * silk threads above a faint black-mirror pool. Musical anatomy:
 *  - kick → light pulse cascades bead-by-bead down a varying thread cluster
 *  - snare → lateral sway of the whole field with lagged follow-the-leader
 *  - hat → sparse single-glowworm glints
 *  - gather → brighten + draw lights inward on the pre-beat inhale
 *  - tension → deepen the dark and lengthen threads as the build climbs
 *  - dropEvent → blaze the entire ceiling constellation at once
 *  - leanIn → ceiling drifts nearer; thread tips brighten faintly (expectant)
 *  - echo → one-shot cool silver-blue ghost cascade down a single cluster
 *  - convergence → scattered thread glows settle into one bar-locked wave
 *    rolling across the cavern; soft desync as the lock fades (no snap)
 *  - tenderness → warm points toward candle-amber
 *  - holdBreath / deep silence → dim to a few still embers; threads freeze
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';
import { getDotTexture } from '../dotTexture';

const THREAD_HIGH = 56;
const THREAD_MID = 36;
const THREAD_LOW = 20;

const BEAD_HIGH = 14;
const BEAD_MID = 10;
const BEAD_LOW = 6;

const CEILING_Y = 2.55;
const POOL_Y = -1.95;
const BASE_LEN = 3.55;

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

export function GlowwormGrottoScene({
  analyser,
  palette,
  tier,
  speed = 1,
}: VisualizerSceneProps) {
  const mods = useModulation();
  const rootRef = useRef<THREE.Group>(null);
  const beadRef = useRef<THREE.Points>(null);
  const beadMatRef = useRef<THREE.PointsMaterial>(null);
  const silkRef = useRef<THREE.LineSegments>(null);
  const silkMatRef = useRef<THREE.LineBasicMaterial>(null);
  const mirrorRef = useRef<THREE.Points>(null);
  const mirrorMatRef = useRef<THREE.PointsMaterial>(null);
  const poolMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();

  const threadCount = tier === 'high' ? THREAD_HIGH : tier === 'mid' ? THREAD_MID : THREAD_LOW;
  const beadPerThread = tier === 'high' ? BEAD_HIGH : tier === 'mid' ? BEAD_MID : BEAD_LOW;
  const beadCount = threadCount * beadPerThread;
  const silkVertCount = threadCount * 2;
  const mirrorStride = tier === 'low' ? 2 : 1;
  const mirrorCount = Math.ceil(beadCount / mirrorStride);
  const kitAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const stillAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const tensionAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const dropAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  // LeanIn / echo amp — low tier still approaches and ghosts, just softer.
  const leanAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  const echoAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  // Convergence amp — full sync on high; slightly softer on mid/low.
  const lockAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;

  const scratchBass = useRef(new THREE.Color());
  const scratchMid = useRef(new THREE.Color());
  const scratchHigh = useRef(new THREE.Color());
  const scratchGlow = useRef(new THREE.Color(0.35, 0.95, 0.72));
  const scratchAmber = useRef(new THREE.Color(1, 0.72, 0.38));
  const scratchEmber = useRef(new THREE.Color(0.18, 0.12, 0.05));
  const scratchDrop = useRef(new THREE.Color(0.85, 1.0, 0.95));
  // Cool silver-blue ghost cascade — cooler/fainter than kick cyan-green.
  const scratchEcho = useRef(new THREE.Color(0.55, 0.78, 1.0));
  const scratchMix = useRef(new THREE.Color());
  const scratchPool = useRef(new THREE.Color(0.015, 0.03, 0.04));
  const scratchGlass = useRef(new THREE.Color(0.02, 0.04, 0.055));

  const gatherSmooth = useRef(0);
  const kickSmooth = useRef(0);
  const snareSmooth = useRef(0);
  const hatSmooth = useRef(0);
  const swellSmooth = useRef(0.15);
  const tenderSmooth = useRef(0);
  const afterglowSmooth = useRef(0);
  const tensionSmooth = useRef(0);
  const dropSmooth = useRef(0);
  const stillnessSmooth = useRef(0);
  // LeanIn anticipation: eager climb, slower release into the drop.
  const leanSmooth = useRef(0);
  // Phrase-echo one-shot: arm on quiet, fire one ghost cascade per gap.
  const echoSmooth = useRef(0);
  const echoTravel = useRef(1); // 0..1 traveling; >=1 idle
  const echoArmed = useRef(true);
  const prevEcho = useRef(0);
  // Convergence lock — scattered glows settle into one bar-locked wave.
  const lockSmooth = useRef(0);
  const prevKick = useRef(0);
  const timeRef = useRef(0);

  // Per-thread cascade travel (0..1 active; >=1 idle) + cluster membership.
  const pulseTravel = useRef(new Float32Array(threadCount));
  const pulseActive = useRef(new Uint8Array(threadCount));
  // Echo cluster membership (separate from kick pulses — cooler ghost replay).
  const echoActive = useRef(new Uint8Array(threadCount));
  // Follow-the-leader lateral sway (X/Z) with per-thread lag chain.
  const swayX = useRef(new Float32Array(threadCount));
  const swayZ = useRef(new Float32Array(threadCount));
  const swayLeadX = useRef(0);
  const swayLeadZ = useRef(0);
  // Tip endpoints reused every frame (no GC churn).
  const tipX = useRef(new Float32Array(threadCount));
  const tipY = useRef(new Float32Array(threadCount));
  const tipZ = useRef(new Float32Array(threadCount));
  // Scratch scores for kick / echo cluster pick (reused, sorted in place).
  const clusterScores = useRef<{ i: number; s: number }[]>([]);

  const sprite = useMemo(() => getDotTexture(), []);

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const {
    beadPositions,
    beadColors,
    beadPhases,
    beadAlong,
    beadThread,
    beadKeeper,
    threadAnchorX,
    threadAnchorZ,
    threadPhase,
    threadBand,
    silkPositions,
    mirrorPositions,
    mirrorColors,
  } = useMemo(() => {
    const bp = new Float32Array(beadCount * 3);
    const bc = new Float32Array(beadCount * 3);
    const ph = new Float32Array(beadCount);
    const along = new Float32Array(beadCount);
    const thr = new Uint16Array(beadCount);
    const keep = new Uint8Array(beadCount);
    const ax = new Float32Array(threadCount);
    const az = new Float32Array(threadCount);
    const tPh = new Float32Array(threadCount);
    const tBand = new Uint8Array(threadCount);
    const silk = new Float32Array(silkVertCount * 3);
    const mp = new Float32Array(mirrorCount * 3);
    const mc = new Float32Array(mirrorCount * 3);

    pulseTravel.current = new Float32Array(threadCount);
    pulseActive.current = new Uint8Array(threadCount);
    echoActive.current = new Uint8Array(threadCount);
    swayX.current = new Float32Array(threadCount);
    swayZ.current = new Float32Array(threadCount);
    tipX.current = new Float32Array(threadCount);
    tipY.current = new Float32Array(threadCount);
    tipZ.current = new Float32Array(threadCount);
    clusterScores.current = Array.from({ length: threadCount }, (_, i) => ({ i, s: 0 }));

    for (let t = 0; t < threadCount; t++) {
      const seed = t * 1.6180339887;
      // Vault layout: denser toward a soft oval canopy, slight depth bias.
      const r = 0.25 + Math.sqrt(hash01(seed + 0.11)) * 2.65;
      const ang = hash01(seed + 0.37) * Math.PI * 2;
      ax[t] = Math.cos(ang) * r;
      az[t] = Math.sin(ang) * r * 0.82;
      tPh[t] = hash01(seed + 2.3);
      tBand[t] = t % 3;
      pulseTravel.current[t] = 1;
      pulseActive.current[t] = 0;
      echoActive.current[t] = 0;

      // Silk: ceiling anchor → tip (updated each frame).
      silk[t * 6] = ax[t]!;
      silk[t * 6 + 1] = CEILING_Y;
      silk[t * 6 + 2] = az[t]!;
      silk[t * 6 + 3] = ax[t]!;
      silk[t * 6 + 4] = CEILING_Y - BASE_LEN;
      silk[t * 6 + 5] = az[t]!;

      for (let b = 0; b < beadPerThread; b++) {
        const i = t * beadPerThread + b;
        const a = (b + 0.55) / beadPerThread;
        along[i] = a;
        thr[i] = t;
        ph[i] = hash01(seed + b * 0.41 + 4.7);
        // A few keepers stay lit as holdBreath embers.
        keep[i] = hash01(seed + b * 1.91 + 9.3) > 0.91 ? 1 : 0;
        bp[i * 3] = ax[t]!;
        bp[i * 3 + 1] = CEILING_Y - a * BASE_LEN;
        bp[i * 3 + 2] = az[t]!;
        // Cool blue-green glowworm default.
        bc[i * 3] = 0.25 + hash01(seed + b) * 0.15;
        bc[i * 3 + 1] = 0.75 + hash01(seed + b + 1) * 0.2;
        bc[i * 3 + 2] = 0.55 + hash01(seed + b + 2) * 0.25;
      }
    }

    for (let i = 0; i < mirrorCount; i++) {
      mp[i * 3 + 1] = -40;
    }

    return {
      beadPositions: bp,
      beadColors: bc,
      beadPhases: ph,
      beadAlong: along,
      beadThread: thr,
      beadKeeper: keep,
      threadAnchorX: ax,
      threadAnchorZ: az,
      threadPhase: tPh,
      threadBand: tBand,
      silkPositions: silk,
      mirrorPositions: mp,
      mirrorColors: mc,
    };
  }, [threadCount, beadPerThread, beadCount, silkVertCount, mirrorCount]);

  useFrame((_state, delta) => {
    const beads = beadRef.current;
    const beadMat = beadMatRef.current;
    if (!beads || !beadMat) return;

    const m = metricsRef.current;
    const dt = Math.min(delta, 0.05);
    const pace = Math.max(0.05, mods.current.speed ?? speed);
    const calm = reducedMotion ? 0.4 : 1;
    const sectionPace = 0.78 + m.sectionLevel * 0.4;

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

    // Convergence envelope early so lockPace can steady the shared clock.
    lockSmooth.current = smoothToward(
      lockSmooth.current,
      Math.min(1, Math.max(0, m.convergence ?? 0)) * lockAmp,
      dt,
      0.1,
      0.18,
    );
    const lock = lockSmooth.current * (1 - stillness * 0.3);
    // Power curve: early lock stays loose; choruses snap into one wave.
    const lockSnap = lock * lock;
    // Steadier continuous drive when locked — not frozen (holdBreath owns that).
    const lockPace = 1 - lock * 0.38;

    timeRef.current += dt * pace * sectionPace * calm * motionMul * lockPace;

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
    hatSmooth.current = smoothToward(
      hatSmooth.current,
      Math.min(1.2, m.hat * 0.95 + m.shimmer * 0.22) * kitAmp,
      dt,
      0.025,
      0.1,
    );
    tenderSmooth.current = smoothToward(tenderSmooth.current, m.tenderness, dt, 0.12, 0.22);
    afterglowSmooth.current = smoothToward(afterglowSmooth.current, m.afterglow, dt, 0.18, 0.8);
    tensionSmooth.current = smoothToward(
      tensionSmooth.current,
      m.tension * tensionAmp,
      dt,
      0.1,
      0.22,
    );
    // Drop springs loose tension and blazes the constellation.
    const dropTarget =
      Math.min(1.35, m.dropEvent * 1.05 + m.impact * 0.2 + m.release * 0.12) * dropAmp;
    if (m.dropEvent > 0.45) {
      tensionSmooth.current = smoothToward(tensionSmooth.current, 0, dt, 0.05, 0.05);
    }
    dropSmooth.current = smoothToward(dropSmooth.current, dropTarget, dt, 0.03, 0.22);

    // LeanIn: fast climb into anticipation, slower release into the drop.
    // Soften only a little under holdBreath so approach still reads through hush.
    // Distinct from tension (darken + lengthen) — this is nearer + tip brighten.
    leanSmooth.current = smoothToward(
      leanSmooth.current,
      Math.min(1, m.leanIn) * leanAmp,
      dt,
      0.06,
      0.18,
    );
    const lean = leanSmooth.current * (1 - stillness * 0.35);

    // Phrase-echo: arm on quiet, fire one cool ghost cascade per gap.
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
      // Pick a single thread cluster — ghost replay of a kick cascade shape.
      const pickSeed = hash01(timeRef.current * 0.53 + echoNow * 11.3 + m.barPhase * 2.7);
      const clusterAng = pickSeed * Math.PI * 2;
      const clusterR = 0.35 + hash01(pickSeed + 2.1) * 1.9;
      const cx = Math.cos(clusterAng) * clusterR;
      const cz = Math.sin(clusterAng) * clusterR * 0.82;
      const clusterSize = Math.max(3, Math.round(threadCount * (0.1 + kitAmp * 0.05)));
      const scores = clusterScores.current;
      for (let i = 0; i < threadCount; i++) {
        echoActive.current[i] = 0;
        const dx = (threadAnchorX[i] ?? 0) - cx;
        const dz = (threadAnchorZ[i] ?? 0) - cz;
        const dist = Math.hypot(dx, dz);
        const jitter = hash01(i * 1.17 + pickSeed) * 0.5;
        const slot = scores[i]!;
        slot.i = i;
        slot.s = dist - jitter;
      }
      scores.sort((a, b) => a.s - b.s);
      for (let k = 0; k < clusterSize && k < scores.length; k++) {
        echoActive.current[scores[k]!.i] = 1;
      }
    }
    prevEcho.current = echoNow;
    if (echoTravel.current < 1) {
      const bpmEcho = m.bpm && m.bpm > 30 ? m.bpm : 120;
      const echoPace = 0.9 + pace * 0.15;
      echoTravel.current = Math.min(
        1,
        echoTravel.current + dt * echoPace * (0.85 + bpmEcho / 180),
      );
      if (echoTravel.current >= 1) {
        for (let i = 0; i < threadCount; i++) echoActive.current[i] = 0;
      }
    }
    const traveling = echoTravel.current < 1;
    // Idle nearly silent so speaking passages never sticky-glow.
    const echoVis = traveling
      ? echoSmooth.current * (1 - echoTravel.current * 0.3)
      : echoSmooth.current * 0.04;

    const gather = gatherSmooth.current;
    const kick = kickSmooth.current;
    const snare = snareSmooth.current;
    const hat = hatSmooth.current;
    const swell = swellSmooth.current;
    const tender = tenderSmooth.current;
    const afterglow = afterglowSmooth.current;
    const tension = tensionSmooth.current;
    const drop = dropSmooth.current;
    const t = timeRef.current;
    // Shared bar clock for the convergence wave — continuous, no bar-boundary snap.
    const barDrive = m.bpm && m.bpm > 30 ? m.barPhase : (t * 0.18) % 1;
    const sharedBarAngle = barDrive * Math.PI * 2;

    // Draw nearer on leanIn — mild camera-ward pull (CosmicMandala pattern),
    // distinct from gather's center inhale and tension's lengthen/darken.
    const root = rootRef.current;
    if (root) {
      root.position.z = -lean * 0.55;
      const leanScale = 1 + lean * 0.06;
      root.scale.setScalar(leanScale);
    }

    // Kick rising edge → cascade a fresh cluster (never the same threads twice in a row).
    if (kick > 0.28 && prevKick.current <= 0.28) {
      const pickSeed = hash01(t * 0.71 + kick * 13.7 + m.barPhase * 3.1);
      const clusterAng = pickSeed * Math.PI * 2;
      const clusterR = 0.4 + hash01(pickSeed + 1.3) * 1.8;
      const cx = Math.cos(clusterAng) * clusterR;
      const cz = Math.sin(clusterAng) * clusterR * 0.82;
      const clusterSize = Math.max(4, Math.round(threadCount * (0.12 + kitAmp * 0.06)));

      // Score threads by proximity to cluster center; activate top N.
      const scores = clusterScores.current;
      for (let i = 0; i < threadCount; i++) {
        const dx = (threadAnchorX[i] ?? 0) - cx;
        const dz = (threadAnchorZ[i] ?? 0) - cz;
        const dist = Math.hypot(dx, dz);
        const jitter = hash01(i * 0.91 + pickSeed) * 0.55;
        const slot = scores[i]!;
        slot.i = i;
        slot.s = dist - jitter;
      }
      scores.sort((a, b) => a.s - b.s);
      for (let k = 0; k < clusterSize && k < scores.length; k++) {
        const ti = scores[k]!.i;
        pulseTravel.current[ti] = 0;
        pulseActive.current[ti] = 1;
      }
    }
    prevKick.current = kick;

    // Advance cascades — BPM-paced so bead-by-bead reads as musical.
    const bpm = m.bpm && m.bpm > 30 ? m.bpm : 120;
    const cascadePace = (0.95 + pace * 0.2) * (0.85 + bpm / 200);
    for (let i = 0; i < threadCount; i++) {
      if (pulseActive.current[i]) {
        pulseTravel.current[i] = Math.min(
          1,
          (pulseTravel.current[i] ?? 1) + dt * cascadePace * (1.15 + (threadPhase[i] ?? 0) * 0.35),
        );
        if ((pulseTravel.current[i] ?? 1) >= 1) {
          pulseActive.current[i] = 0;
          pulseTravel.current[i] = 1;
        }
      }
    }

    // Snare lead sway → follow-the-leader lag down the thread index chain.
    const gustX = snare * (0.9 + Math.sin(t * 0.7) * 0.25) * 1.55 * pace * calm;
    const gustZ = snare * (0.55 + Math.cos(t * 0.55) * 0.2) * pace * calm;
    swayLeadX.current = smoothToward(swayLeadX.current, gustX, dt, 0.04, 0.16);
    swayLeadZ.current = smoothToward(swayLeadZ.current, gustZ, dt, 0.04, 0.16);
    let prevX = swayLeadX.current;
    let prevZ = swayLeadZ.current;
    for (let i = 0; i < threadCount; i++) {
      const lagTau = 0.045 + (i % 7) * 0.012 + (threadPhase[i] ?? 0) * 0.02;
      swayX.current[i] = smoothToward(swayX.current[i] ?? 0, prevX, dt, lagTau, lagTau * 1.35);
      swayZ.current[i] = smoothToward(swayZ.current[i] ?? 0, prevZ, dt, lagTau, lagTau * 1.35);
      prevX = swayX.current[i] ?? 0;
      prevZ = swayZ.current[i] ?? 0;
    }

    // Tension lengthens threads; gather shortens slightly (inhale pull).
    const lenMul = (1 + tension * 0.38 - gather * 0.12) * (1 - tender * 0.06);
    const hangLen = BASE_LEN * lenMul;

    beadMat.size =
      (0.055 + swell * 0.02 + kick * 0.028 + drop * 0.04 + afterglow * 0.012) *
      (0.92 + kitAmp * 0.08) *
      (1 - tender * 0.1) *
      (0.7 + (1 - stillness * 0.48) * 0.3);
    beadMat.opacity = Math.min(
      1,
      (0.78 + swell * 0.14 + kick * 0.1 + drop * 0.18 + afterglow * 0.08) *
        (1 - stillness * 0.35),
    );

    const silkMat = silkMatRef.current;
    if (silkMat) {
      silkMat.opacity =
        (0.12 + swell * 0.06 + gather * 0.08 + tension * 0.05 + lockSnap * 0.05) *
        (1 - stillness * 0.55) *
        (1 - tender * 0.15);
    }

    const mirrors = mirrorRef.current;
    const mirrorMat = mirrorMatRef.current;
    if (mirrorMat) {
      mirrorMat.size = beadMat.size * 0.72;
      mirrorMat.opacity = Math.min(
        0.48,
        (0.22 + swell * 0.1 + kick * 0.08 + drop * 0.1) *
          (tier === 'low' ? 0.7 : 1) *
          (1 - tender * 0.12) *
          (1 - stillness * 0.3),
      );
    }

    const poolMat = poolMatRef.current;
    if (poolMat) {
      const poolC = scratchPool.current.setRGB(0.015, 0.03, 0.04);
      poolC.offsetHSL(0.015 * tender, 0.06 * tender, 0.03 * tender);
      poolC.lerp(scratchGlass.current, stillness * 0.7);
      // Tension deepens the cavern dark into the pool.
      poolC.multiplyScalar(1 - tension * 0.35);
      poolMat.color.copy(poolC);
      poolMat.opacity =
        (0.62 + swell * 0.06 + tender * 0.05) * (1 - stillness * 0.15) + stillness * 0.72;
    }

    const posAttr = beads.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = beads.geometry.getAttribute('color') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const colArr = colAttr.array as Float32Array;

    const silk = silkRef.current;
    const silkAttr = silk
      ? (silk.geometry.getAttribute('position') as THREE.BufferAttribute)
      : null;
    const silkArr = silkAttr ? (silkAttr.array as Float32Array) : null;

    const bassC = scratchBass.current.set(palette.bass);
    const midC = scratchMid.current.set(palette.mid);
    const highC = scratchHigh.current.set(palette.high);
    const glowC = scratchGlow.current.setRGB(0.35, 0.95, 0.72);
    const amberC = scratchAmber.current.setRGB(1, 0.72, 0.38);
    const emberC = scratchEmber.current.setRGB(0.18, 0.12, 0.05);
    const dropC = scratchDrop.current.setRGB(0.85, 1.0, 0.95);
    const echoC = scratchEcho.current.setRGB(0.55, 0.78, 1.0);
    const mixC = scratchMix.current;

    let mirrorIdx = 0;
    const mirrorArr = mirrors
      ? ((mirrors.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array)
      : null;
    const mirrorColArr = mirrors
      ? ((mirrors.geometry.getAttribute('color') as THREE.BufferAttribute).array as Float32Array)
      : null;

    // Per-thread tip positions for silk endpoints.
    const tipsX = tipX.current;
    const tipsY = tipY.current;
    const tipsZ = tipZ.current;

    for (let ti = 0; ti < threadCount; ti++) {
      const phase = threadPhase[ti] ?? 0;
      const ax0 = threadAnchorX[ti] ?? 0;
      const az0 = threadAnchorZ[ti] ?? 0;

      // Gather inhale: pull anchors toward vault center.
      const pull = 1 - gather * 0.55;
      let ax = ax0 * pull;
      let az = az0 * pull;
      if (gather > 0.02) {
        const homePull = gather * dt * 1.1;
        ax += (ax0 * (1 - gather * 0.5) - ax) * homePull;
        az += (az0 * (1 - gather * 0.5) - az) * homePull;
      }

      // Idle breath sway — nearly frozen on holdBreath. Under lock, stagger
      // collapses so the vault breathes as one without freezing sway amp.
      const breathPhase =
        phase * 8.0 * (1 - lockSnap) + lockSnap * (ax0 * 0.55 + az0 * 0.4);
      const breath =
        Math.sin(t * (0.45 + phase * 0.35 * (1 - lockSnap) + lockSnap * 0.5) + breathPhase) *
        (0.04 + swell * 0.03) *
        (1 - tender * 0.4) *
        motionMul *
        (1 - lock * 0.28);
      const breathZ =
        Math.cos(
          t * (0.38 + phase * 0.3 * (1 - lockSnap) + lockSnap * 0.42) +
            phase * 5.5 * (1 - lockSnap) +
            lockSnap * (ax0 * 0.4 - az0 * 0.35),
        ) *
        (0.03 + swell * 0.025) *
        motionMul *
        (1 - lock * 0.28);

      const sx = (swayX.current[ti] ?? 0) * dt * 0.85 + breath * pace * calm;
      const sz = (swayZ.current[ti] ?? 0) * dt * 0.85 + breathZ * pace * calm;

      // Tip hangs below ceiling; tension lengthens; soft curl at tip.
      const tipCurl = 0.08 + phase * 0.06 + tension * 0.04;
      tipsX[ti] = ax + sx * hangLen * 0.35 + Math.sin(phase * 12.0) * tipCurl;
      tipsY[ti] = CEILING_Y - hangLen;
      tipsZ[ti] = az + sz * hangLen * 0.35 + Math.cos(phase * 9.0) * tipCurl * 0.8;

      if (silkArr) {
        silkArr[ti * 6] = ax;
        silkArr[ti * 6 + 1] = CEILING_Y;
        silkArr[ti * 6 + 2] = az;
        silkArr[ti * 6 + 3] = tipsX[ti]!;
        silkArr[ti * 6 + 4] = tipsY[ti]!;
        silkArr[ti * 6 + 5] = tipsZ[ti]!;
      }
    }

    for (let i = 0; i < beadCount; i++) {
      const i3 = i * 3;
      const ti = beadThread[i]!;
      const along = beadAlong[i]!;
      const phase = beadPhases[i]!;
      const band = threadBand[ti] ?? 0;
      const keeper = beadKeeper[i]!;

      const ax = silkArr ? silkArr[ti * 6]! : (threadAnchorX[ti] ?? 0);
      const az = silkArr ? silkArr[ti * 6 + 2]! : (threadAnchorZ[ti] ?? 0);
      const tx = tipsX[ti]!;
      const ty = tipsY[ti]!;
      const tz = tipsZ[ti]!;

      // Bead sits along silk with a slight organic offset.
      const wobble =
        Math.sin(t * (1.1 + phase) + along * 6.0 + phase * 14.0) *
        0.018 *
        (1 - tender * 0.5) *
        motionMul;
      const x = ax + (tx - ax) * along + wobble;
      const y = CEILING_Y + (ty - CEILING_Y) * along;
      const z = az + (tz - az) * along + wobble * 0.7;

      arr[i3] = x;
      arr[i3 + 1] = y;
      arr[i3 + 2] = z;

      const baseCol = band === 0 ? bassC : band === 1 ? midC : highC;
      mixC.copy(baseCol).lerp(glowC, 0.55 + phase * 0.2 + afterglow * 0.15);
      // Tenderness warms toward candle-amber (distinct from holdBreath coal).
      mixC.lerp(amberC, tender * (0.55 + phase * 0.2));
      // Drop blazes cool-white constellation.
      mixC.lerp(dropC, Math.min(0.85, drop * 0.7));

      // Kick cascade: bright crest travels down the thread bead-by-bead.
      const travel = pulseTravel.current[ti] ?? 1;
      const active = pulseActive.current[ti] ?? 0;
      let cascade = 0;
      if (active || travel < 1) {
        const crest = travel; // 0 at ceiling → 1 at tip
        const dist = Math.abs(along - crest);
        cascade = Math.exp((-dist * dist) / 0.018) * (1 - travel * 0.25);
      }

      // Phrase-echo ghost cascade: cooler/fainter silver-blue crest on one cluster.
      let echoCascade = 0;
      if (traveling && (echoActive.current[ti] ?? 0)) {
        const crest = echoTravel.current;
        const dist = Math.abs(along - crest);
        echoCascade =
          Math.exp((-dist * dist) / 0.022) *
          (0.55 + 0.45 * Math.max(0, Math.sin(crest * Math.PI * 8 + phase * 14.0))) *
          (1 - crest * 0.2);
      }
      const echoPulse = echoVis * echoCascade * (1 - stillness * 0.55);

      // Convergence: blend independent per-thread glow into one bar-locked
      // wave rolling across the vault (spatial phase from anchor X/Z). Soft
      // desync as lock fades — never snaps. Distinct from kick cascade / echo
      // ghost / drop blaze (those are one-shots; this is sustained lock-in).
      const ax0 = threadAnchorX[ti] ?? 0;
      const az0 = threadAnchorZ[ti] ?? 0;
      const spatialPhase = ax0 * 0.72 + az0 * 0.48;
      const personalGlow =
        0.5 + 0.5 * Math.sin(t * (0.7 + phase * 0.5) + phase * 12.5 + along * 1.2);
      const sharedGlow = 0.5 + 0.5 * Math.sin(sharedBarAngle - spatialPhase);
      const glowMix = personalGlow * (1 - lockSnap) + sharedGlow * lockSnap;
      // Strength rises with lock; mid-fade still shows personal pulses dispersing.
      const lockGlow = glowMix * (0.22 * lock + 0.7 * lockSnap);

      // Hat: sparse single-glowworm winks.
      const winkSelect = hash01(phase * 19.7 + i * 0.27 + Math.floor(t * 2.5)) > 0.82 ? 1 : 0;
      const wink = winkSelect * hat * (1.05 + m.shimmer * 0.3);

      // HoldBreath: dim all but keepers to residual embers.
      const emberGate = keeper ? 1 - stillness * 0.28 : 1 - stillness * 0.88;
      if (stillness > 0.05 && !keeper) {
        mixC.lerp(emberC, stillness * 0.7);
      } else if (stillness > 0.05 && keeper) {
        mixC.lerp(emberC, stillness * 0.35);
        mixC.lerp(amberC, stillness * 0.15);
      }
      // Echo reply → cool silver-blue (cooler than kick cyan-green / drop blaze).
      mixC.lerp(echoC, echoPulse * 0.78);

      const gatherBright = 1 + gather * 0.45;
      const tensionDim = 1 - tension * 0.22;
      // LeanIn tip brighten: beads nearer the tip (high along) glow expectantly.
      const tipBright = 1 + lean * along * along * 0.55;
      const gain =
        (0.55 +
          swell * 0.25 +
          cascade * 1.35 +
          echoPulse * 0.95 +
          lockGlow * 1.05 +
          wink * 0.95 +
          drop * 0.55 +
          kick * 0.08) *
        gatherBright *
        tensionDim *
        tipBright *
        (0.92 + afterglow * 0.12) *
        (1 - tender * 0.08) *
        emberGate;

      colArr[i3] = Math.min(1, mixC.r * gain);
      colArr[i3 + 1] = Math.min(1, mixC.g * gain);
      colArr[i3 + 2] = Math.min(1, mixC.b * gain);

      if (mirrorArr && mirrorColArr && i % mirrorStride === 0 && mirrorIdx < mirrorCount) {
        const mi3 = mirrorIdx * 3;
        const ripple =
          (Math.sin(t * (0.6 + phase) + x * 1.3 + z * 1.1) * (0.03 + swell * 0.05) +
            Math.sin(t * 1.05 + z * 1.7) * snare * 0.04) *
          motionMul;
        mirrorArr[mi3] = x + ripple;
        mirrorArr[mi3 + 1] = POOL_Y - (y - POOL_Y) * 0.42 - 0.06;
        mirrorArr[mi3 + 2] = z + ripple * 0.55;
        const dim =
          (0.38 + swell * 0.1 + cascade * 0.2 + echoPulse * 0.18 + drop * 0.12) *
          (1 - stillness * 0.3);
        mirrorColArr[mi3] = Math.min(1, colArr[i3]! * dim * (0.8 + tender * 0.2));
        mirrorColArr[mi3 + 1] = Math.min(1, colArr[i3 + 1]! * dim * 0.95);
        mirrorColArr[mi3 + 2] = Math.min(1, colArr[i3 + 2]! * dim * 0.85);
        mirrorIdx += 1;
      }
    }

    // Park unused mirror slots offscreen.
    if (mirrorArr && mirrorColArr) {
      for (; mirrorIdx < mirrorCount; mirrorIdx++) {
        const mi3 = mirrorIdx * 3;
        mirrorArr[mi3 + 1] = -40;
        mirrorColArr[mi3] = 0;
        mirrorColArr[mi3 + 1] = 0;
        mirrorColArr[mi3 + 2] = 0;
      }
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    if (silkAttr) silkAttr.needsUpdate = true;
    if (mirrors && mirrorArr && mirrorColArr) {
      (mirrors.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (mirrors.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    }

    // Slow cavern yaw — freezes with holdBreath. Position/scale owned by leanIn above.
    if (root) {
      root.rotation.y +=
        dt *
        pace *
        calm *
        motionMul *
        (0.025 + m.mid * 0.02 + swell * 0.012) *
        (1 - tender * 0.35) *
        (1 - tension * 0.2) *
        (1 - lean * 0.25) *
        (1 - lock * 0.2);
    }

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  return (
    <group ref={rootRef}>
      {/* Black mirror pool — faint reflections of the living ceiling. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, POOL_Y, 0]}>
        <planeGeometry args={[14, 14, 1, 1]} />
        <meshBasicMaterial
          ref={poolMatRef}
          color="#03080a"
          transparent
          opacity={0.64}
          depthWrite={false}
        />
      </mesh>

      {/* Dim silk threads — limestone hangers for the glowworms. */}
      <lineSegments ref={silkRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[silkPositions, 3]}
            count={silkVertCount}
          />
        </bufferGeometry>
        <lineBasicMaterial
          ref={silkMatRef}
          color="#1a2a28"
          transparent
          opacity={0.14}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>

      <points ref={beadRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[beadPositions, 3]}
            count={beadCount}
          />
          <bufferAttribute attach="attributes-color" args={[beadColors, 3]} count={beadCount} />
        </bufferGeometry>
        <pointsMaterial
          ref={beadMatRef}
          size={0.06}
          map={sprite}
          sizeAttenuation
          transparent
          vertexColors
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      <points ref={mirrorRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[mirrorPositions, 3]}
            count={mirrorCount}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[mirrorColors, 3]}
            count={mirrorCount}
          />
        </bufferGeometry>
        <pointsMaterial
          ref={mirrorMatRef}
          size={0.045}
          map={sprite}
          sizeAttenuation
          transparent
          vertexColors
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}
