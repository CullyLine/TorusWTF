'use client';

/**
 * Jellyfish Bloom — bioluminescent jellies drifting in dark water.
 * Musical anatomy:
 *  - gather → bells contract (anticipate) before the beat
 *  - leanIn → bloom drifts nearer; bells tip up expectantly (pre-drop pull)
 *  - kick → pulse-propulsion thrust; bells flare open after the contract
 *  - snare → lateral current gust that shears the bloom
 *  - hat → sparse plankton glints on selected tentacle tips
 *  - tenderness → milky moonlit haze (softer glow, gentler swim)
 *  - holdBreath / deep silence → still propulsion; jellies hang mid-water
 *  - echo → one-shot bioluminescent pulse train rippling jelly-to-jelly
 *
 * Tentacles are follow-the-leader chains: each segment SmoothDamps toward
 * the previous, so trails carry lagged inertia instead of straight lines.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';
import { getDotTexture } from '../dotTexture';

const JELLY_HIGH = 14;
const JELLY_MID = 9;
const JELLY_LOW = 5;

const TENT_HIGH = 5;
const TENT_MID = 4;
const TENT_LOW = 3;

const SEG_HIGH = 14;
const SEG_MID = 10;
const SEG_LOW = 6;

const PLANKTON_HIGH = 90;
const PLANKTON_MID = 48;
const PLANKTON_LOW = 0;

const Y_MIN = -2.15;
const Y_MAX = 2.35;

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

const _dummy = /* @__PURE__ */ new THREE.Object3D();
const _bellColor = /* @__PURE__ */ new THREE.Color();

export function JellyfishBloomScene({ analyser, palette, tier, speed = 1 }: VisualizerSceneProps) {
  const mods = useModulation();
  const rootRef = useRef<THREE.Group>(null);
  const bellRef = useRef<THREE.InstancedMesh>(null);
  const tentRef = useRef<THREE.Points>(null);
  const tentMatRef = useRef<THREE.PointsMaterial>(null);
  const plankRef = useRef<THREE.Points>(null);
  const plankMatRef = useRef<THREE.PointsMaterial>(null);
  const waterMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();

  const jellyCount = tier === 'high' ? JELLY_HIGH : tier === 'mid' ? JELLY_MID : JELLY_LOW;
  const tentCount = tier === 'high' ? TENT_HIGH : tier === 'mid' ? TENT_MID : TENT_LOW;
  const segCount = tier === 'high' ? SEG_HIGH : tier === 'mid' ? SEG_MID : SEG_LOW;
  const planktonCount =
    tier === 'high' ? PLANKTON_HIGH : tier === 'mid' ? PLANKTON_MID : PLANKTON_LOW;
  const tentPointCount = jellyCount * tentCount * segCount;
  const kitAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const stillAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const tenderAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  const leanAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  const echoAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;

  const scratchBass = useRef(new THREE.Color());
  const scratchMid = useRef(new THREE.Color());
  const scratchHigh = useRef(new THREE.Color());
  const scratchMilk = useRef(new THREE.Color(0.78, 0.88, 1.0));
  const scratchGlow = useRef(new THREE.Color(0.55, 0.95, 0.92));
  // Cool aqua reply — cooler than kick cyan flare, distinct from milk tenderness.
  const scratchEcho = useRef(new THREE.Color(0.42, 0.92, 1.0));
  const scratchMix = useRef(new THREE.Color());
  const scratchWater = useRef(new THREE.Color(0.01, 0.03, 0.07));

  const gatherSmooth = useRef(0);
  const kickSmooth = useRef(0);
  const snareSmooth = useRef(0);
  const hatSmooth = useRef(0);
  const swellSmooth = useRef(0.15);
  const afterglowSmooth = useRef(0);
  const stillnessSmooth = useRef(0);
  const tenderSmooth = useRef(0);
  // LeanIn anticipation: eager climb, slower release into the drop.
  const leanSmooth = useRef(0);
  // Phrase-echo one-shot: arm on quiet, fire one jelly-to-jelly pulse train.
  const echoSmooth = useRef(0);
  const echoTravel = useRef(1); // 0..1 traveling; >=1 idle
  const echoArmed = useRef(true);
  const prevEcho = useRef(0);
  const timeRef = useRef(0);

  // Per-jelly kinematics — thrust lives in velocity, not position snaps.
  const jellyPos = useRef(new Float32Array(jellyCount * 3));
  const jellyVel = useRef(new Float32Array(jellyCount * 3));
  const bellScale = useRef(new Float32Array(jellyCount));
  const contractSmooth = useRef(new Float32Array(jellyCount));
  // Tentacle segment positions (follow-the-leader lag chain).
  const tentPos = useRef(new Float32Array(tentPointCount * 3));

  const sprite = useMemo(() => getDotTexture(), []);

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const { home, phases, sizes, bands, tentAttach, planktonPhases } = useMemo(() => {
    const h = new Float32Array(jellyCount * 3);
    const ph = new Float32Array(jellyCount);
    const sz = new Float32Array(jellyCount);
    const b = new Uint8Array(jellyCount);
    // Per tentacle: azimuth around bell underside + length scale.
    const attach = new Float32Array(jellyCount * tentCount * 2);
    const pPh = new Float32Array(Math.max(planktonCount, 1));

    const jp = jellyPos.current;
    const jv = jellyVel.current;
    const bs = bellScale.current;
    const cs = contractSmooth.current;
    const tp = tentPos.current;

    for (let i = 0; i < jellyCount; i++) {
      const seed = i * 1.6180339887;
      const r = 0.45 + Math.sqrt(hash01(seed + 0.11)) * 2.35;
      const ang = hash01(seed + 0.37) * Math.PI * 2;
      const y = Y_MIN + 0.45 + hash01(seed + 0.71) * (Y_MAX - Y_MIN - 0.9);
      h[i * 3] = Math.cos(ang) * r;
      h[i * 3 + 1] = y;
      h[i * 3 + 2] = Math.sin(ang) * r * 0.9;
      jp[i * 3] = h[i * 3]!;
      jp[i * 3 + 1] = h[i * 3 + 1]!;
      jp[i * 3 + 2] = h[i * 3 + 2]!;
      jv[i * 3] = 0;
      jv[i * 3 + 1] = 0;
      jv[i * 3 + 2] = 0;
      bs[i] = 1;
      cs[i] = 0;
      ph[i] = hash01(seed + 2.3);
      b[i] = i % 3;
      sz[i] = 0.75 + hash01(seed + 2.9) * 0.85;

      for (let t = 0; t < tentCount; t++) {
        const ai = (i * tentCount + t) * 2;
        attach[ai] = (t / tentCount) * Math.PI * 2 + hash01(seed + t * 0.17) * 0.45;
        attach[ai + 1] = 0.72 + hash01(seed + t * 0.41) * 0.55;
        for (let s = 0; s < segCount; s++) {
          const pi = (i * tentCount * segCount + t * segCount + s) * 3;
          tp[pi] = jp[i * 3]!;
          tp[pi + 1] = jp[i * 3 + 1]! - (s + 1) * 0.09;
          tp[pi + 2] = jp[i * 3 + 2]!;
        }
      }
    }

    for (let i = 0; i < planktonCount; i++) {
      pPh[i] = hash01(i * 2.718 + 0.5);
    }

    jellyPos.current = jp;
    jellyVel.current = jv;
    bellScale.current = bs;
    contractSmooth.current = cs;
    tentPos.current = tp;

    return {
      home: h,
      phases: ph,
      sizes: sz,
      bands: b,
      tentAttach: attach,
      planktonPhases: pPh,
    };
  }, [jellyCount, tentCount, segCount, planktonCount]);

  const tentPositions = useMemo(() => new Float32Array(tentPointCount * 3), [tentPointCount]);
  const tentColors = useMemo(() => new Float32Array(tentPointCount * 3), [tentPointCount]);

  const planktonPositions = useMemo(
    () => new Float32Array(Math.max(planktonCount, 1) * 3),
    [planktonCount],
  );
  const planktonColors = useMemo(
    () => new Float32Array(Math.max(planktonCount, 1) * 3),
    [planktonCount],
  );

  const bellGeo = useMemo(() => new THREE.SphereGeometry(0.16, 12, 10), []);
  const bellMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.84,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [],
  );

  useFrame((_state, delta) => {
    const bells = bellRef.current;
    const tents = tentRef.current;
    const tentMat = tentMatRef.current;
    if (!bells || !tents || !tentMat) return;

    // One-time seed of instance matrices/colors after mount.
    if (!(bells.userData as { seeded?: boolean }).seeded) {
      for (let i = 0; i < jellyCount; i++) {
        const i3 = i * 3;
        _dummy.position.set(home[i3]!, home[i3 + 1]!, home[i3 + 2]!);
        const s = sizes[i]!;
        _dummy.scale.set(s * 0.9, s * 0.55, s * 0.9);
        _dummy.rotation.set(0, 0, 0);
        _dummy.updateMatrix();
        bells.setMatrixAt(i, _dummy.matrix);
        const band = bands[i]!;
        _bellColor.set(band === 0 ? palette.bass : band === 1 ? palette.mid : palette.high);
        bells.setColorAt(i, _bellColor);
      }
      bells.instanceMatrix.needsUpdate = true;
      if (bells.instanceColor) bells.instanceColor.needsUpdate = true;
      (bells.userData as { seeded?: boolean }).seeded = true;
    }

    const m = metricsRef.current;
    const dt = Math.min(delta, 0.05);
    const pace = Math.max(0.05, mods.current.speed ?? speed);
    const calm = reducedMotion ? 0.4 : 1;
    const sectionPace = 0.78 + m.sectionLevel * 0.4;

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
    const still = stillnessSmooth.current;
    const motionMul = 1 - still * 0.92;

    timeRef.current += dt * pace * sectionPace * calm * motionMul;

    gatherSmooth.current = smoothToward(gatherSmooth.current, m.gather, dt, 0.04, 0.14);
    swellSmooth.current = smoothToward(swellSmooth.current, m.swell, dt, 0.12, 0.45);
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
      Math.min(1.2, m.hat * 0.95 + m.shimmer * 0.22) * kitAmp,
      dt,
      0.025,
      0.1,
    );
    tenderSmooth.current = smoothToward(
      tenderSmooth.current,
      m.tenderness * tenderAmp,
      dt,
      0.12,
      0.22,
    );
    afterglowSmooth.current = smoothToward(afterglowSmooth.current, m.afterglow, dt, 0.18, 0.8);

    // LeanIn: fast climb into anticipation, slower release into the drop.
    // Soften only a little under holdBreath so approach still reads through hush.
    leanSmooth.current = smoothToward(
      leanSmooth.current,
      Math.min(1, m.leanIn) * leanAmp,
      dt,
      0.06,
      0.18,
    );
    const lean = leanSmooth.current * (1 - still * 0.35);

    // Phrase-echo: arm on quiet, fire one jelly-to-jelly pulse train per gap.
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
      echoTravel.current = Math.min(1, echoTravel.current + dt * echoPace * (0.85 + bpm / 180));
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
    const t = timeRef.current;

    // Draw nearer on leanIn — mild camera-ward pull (CosmicMandala pattern),
    // distinct from gather's per-bell contract. Soft scale so the bloom fills.
    const root = rootRef.current;
    if (root) {
      root.position.z = -lean * 0.55;
      const leanScale = 1 + lean * 0.08;
      root.scale.setScalar(leanScale);
    }

    tentMat.size =
      (0.055 + swell * 0.02 + kick * 0.018) * (0.9 + kitAmp * 0.1) * (1 - tender * 0.08);
    tentMat.opacity = Math.min(0.95, 0.55 + swell * 0.18 + kick * 0.1) * (1 - still * 0.22);

    const waterMat = waterMatRef.current;
    if (waterMat) {
      const waterC = scratchWater.current.setRGB(0.01, 0.03, 0.07);
      // Moonlit milk on tenderness — cool haze, not amber honey.
      waterC.offsetHSL(0.04 * tender, 0.05 * tender, 0.05 * tender);
      waterMat.color.copy(waterC);
      waterMat.opacity = 0.62 + swell * 0.06 + tender * 0.08 + still * 0.05;
    }

    const bassC = scratchBass.current.set(palette.bass);
    const midC = scratchMid.current.set(palette.mid);
    const highC = scratchHigh.current.set(palette.high);
    const milkC = scratchMilk.current.setRGB(0.78, 0.88, 1.0);
    const glowC = scratchGlow.current.setRGB(0.55, 0.95, 0.92);
    const echoC = scratchEcho.current.setRGB(0.42, 0.92, 1.0);
    const mixC = scratchMix.current;

    const jp = jellyPos.current;
    const jv = jellyVel.current;
    const bs = bellScale.current;
    const cs = contractSmooth.current;
    const tp = tentPos.current;

    const tentPosAttr = tents.geometry.getAttribute('position') as THREE.BufferAttribute;
    const tentColAttr = tents.geometry.getAttribute('color') as THREE.BufferAttribute;
    const tentArr = tentPosAttr.array as Float32Array;
    const tentCol = tentColAttr.array as Float32Array;

    // Shared current — snare gust shears the water sideways with inertia.
    const gustX = snare * 1.65 * pace * calm * motionMul;
    const gustZ = snare * 0.55 * pace * calm * motionMul;

    for (let i = 0; i < jellyCount; i++) {
      const i3 = i * 3;
      const phase = phases[i]!;
      const band = bands[i]!;
      const sizeMul = sizes[i]!;
      const hx = home[i3]!;
      const hy = home[i3 + 1]!;
      const hz = home[i3 + 2]!;

      // Anticipate: gather contracts the bell; personal phase staggers the bloom.
      const personalGather = Math.min(1, gather * (0.75 + phase * 0.5));
      cs[i] = smoothToward(cs[i] ?? 0, personalGather, dt, 0.05, 0.16);
      const contract = cs[i] ?? 0;

      // Target scale: contract on gather, flare open on kick (pulse phrasing).
      const scaleTarget =
        (1 - contract * 0.38 + kick * (0.42 + (band === 0 ? 0.12 : 0)) - tender * 0.06) *
        (0.9 + sizeMul * 0.12);
      bs[i] = smoothToward(bs[i] ?? 1, scaleTarget, dt, 0.04, 0.12);
      const scale = bs[i] ?? 1;

      // Pulse thrust: kick drives upward/forward; gather holds back slightly.
      const heading = phase * Math.PI * 2 + t * (0.08 + phase * 0.04);
      const thrust =
        kick * (1.55 + sizeMul * 0.45) * (1 - contract * 0.35) * (1 - tender * 0.4) * motionMul;
      const idleLift =
        (0.08 + swell * 0.12 + m.bass * 0.06) *
        Math.sin(t * (0.55 + phase * 0.35) + phase * 9.0) *
        (1 - tender * 0.45) *
        motionMul;

      const targetVx =
        Math.cos(heading) * thrust * 0.55 +
        (i & 1 ? 1 : -1) * gustX * (0.55 + phase * 0.4) +
        Math.sin(t * (0.22 + phase * 0.2) + phase * 5.0) * (0.05 + m.mid * 0.04) * motionMul;
      const targetVy =
        thrust * 0.95 +
        idleLift +
        (hy - (jp[i3 + 1] ?? hy)) * 0.35 * motionMul -
        gather * 0.12 * motionMul;
      const targetVz =
        Math.sin(heading) * thrust * 0.55 +
        (phase > 0.5 ? 1 : -1) * gustZ * (0.45 + phase * 0.35) +
        Math.cos(t * (0.18 + phase * 0.25) + phase * 3.5) * (0.04 + m.mid * 0.03) * motionMul;

      // Velocity SmoothDamp — propulsion never pops.
      jv[i3] = smoothToward(jv[i3] ?? 0, targetVx * pace * calm, dt, 0.06, 0.22);
      jv[i3 + 1] = smoothToward(jv[i3 + 1] ?? 0, targetVy * pace * calm, dt, 0.05, 0.2);
      jv[i3 + 2] = smoothToward(jv[i3 + 2] ?? 0, targetVz * pace * calm, dt, 0.06, 0.22);

      let x = (jp[i3] ?? hx) + (jv[i3] ?? 0) * dt;
      let y = (jp[i3 + 1] ?? hy) + (jv[i3 + 1] ?? 0) * dt;
      let z = (jp[i3 + 2] ?? hz) + (jv[i3 + 2] ?? 0) * dt;

      // Soft home leash so the bloom stays framed.
      const leash = 0.35 * dt * (1 + still * 1.2);
      x += (hx - x) * leash;
      y += (hy - y) * leash * 0.55;
      z += (hz - z) * leash;

      // Soft bounds — wrap gently rather than snap.
      if (y > Y_MAX) y = Y_MIN + 0.3 + hash01(phase * 11.1) * 0.2;
      if (y < Y_MIN) y = Y_MIN + 0.15;
      const rad = Math.hypot(x, z);
      if (rad > 3.6) {
        const s = 3.2 / rad;
        x *= s;
        z *= s;
      }

      jp[i3] = x;
      jp[i3 + 1] = y;
      jp[i3 + 2] = z;

      // Phrase-echo crest: sweep jelly-to-jelly by phase order so the bloom
      // answers once in the gap as a traveling bioluminescent pulse train.
      const jellySlot = ((phase + i * 0.07) % 1 + 1) % 1;
      const crestDist = Math.abs(jellySlot - echoTravel.current);
      const crestWrap = Math.min(crestDist, 1 - crestDist);
      const crestEnv = traveling
        ? Math.exp(-crestWrap * crestWrap * 55) *
          (0.4 +
            0.6 *
              Math.max(
                0,
                Math.sin(echoTravel.current * Math.PI * 10 + phase * 18.0),
              ))
        : 0;
      const echoPulse = echoVis * crestEnv * (1 - still * 0.55);

      // Flattened bell — contracts taller/narrower on gather, flares open on kick.
      // LeanIn: tip the bell mouth up/toward camera (expectant), not a gather squeeze.
      const bellSX = 0.85 * sizeMul * scale * (1 + kick * 0.12 + echoPulse * 0.1);
      const bellSY =
        0.55 * sizeMul * (1.15 - (scale - 1) * 0.55 + contract * 0.2) * (1 + echoPulse * 0.18);
      const bellSZ = 0.85 * sizeMul * scale * (1 + kick * 0.12 + echoPulse * 0.1);
      const tipUp = lean * (0.32 + phase * 0.12);
      _dummy.position.set(x, y, z);
      _dummy.scale.set(bellSX, bellSY, bellSZ);
      _dummy.rotation.set(
        -tipUp,
        heading * 0.35,
        Math.sin(t * 0.4 + phase * 6) * 0.12 * motionMul,
      );
      _dummy.updateMatrix();
      bells.setMatrixAt(i, _dummy.matrix);

      const baseCol = band === 0 ? bassC : band === 1 ? midC : highC;
      mixC.copy(baseCol).lerp(glowC, 0.28 + phase * 0.15 + kick * 0.25 + afterglow * 0.2);
      // Tenderness → milky moonlight (cool, soft) — distinct from kick cyan flare.
      mixC.lerp(milkC, tender * 0.55 + still * 0.2);
      // Echo reply → cool aqua bioluminescence crest (cooler than kick glow).
      mixC.lerp(echoC, echoPulse * 0.72);

      const pulseGain = 0.75 + scale * 0.45 + kick * 0.35 + swell * 0.18 + echoPulse * 0.85;
      const hush = (1 - tender * 0.18) * (1 - still * 0.28);
      _bellColor.setRGB(
        Math.min(1, mixC.r * pulseGain * hush),
        Math.min(1, mixC.g * pulseGain * hush),
        Math.min(1, mixC.b * pulseGain * hush),
      );
      bells.setColorAt(i, _bellColor);

      // Tentacle chains — each segment lags the previous (never a straight line).
      const bellR = 0.12 * scale * sizeMul;
      for (let ti = 0; ti < tentCount; ti++) {
        const ai = (i * tentCount + ti) * 2;
        const az = tentAttach[ai]!;
        const lenScale = tentAttach[ai + 1]!;
        // Attachment under the bell rim — contracts with the bell.
        let prevX = x + Math.cos(az) * bellR * (0.85 + contract * 0.15);
        let prevY = y - bellR * (0.55 + (1 - scale) * 0.35);
        let prevZ = z + Math.sin(az) * bellR * (0.85 + contract * 0.15);

        for (let s = 0; s < segCount; s++) {
          const pi = (i * tentCount * segCount + ti * segCount + s) * 3;
          const along = (s + 1) / segCount;
          // Trailing sway — delayed phase down the strand for fluid lag.
          const swayT = t * (0.7 + phase * 0.4) - along * (1.8 + snare * 0.9) + az;
          const swayAmp =
            (0.04 + along * 0.11) *
            (1 - contract * 0.45) *
            (1 - tender * 0.4) *
            motionMul *
            lenScale;
          const targetX =
            prevX +
            Math.cos(az + along * 0.35) * along * 0.02 * lenScale +
            Math.sin(swayT) * swayAmp +
            (i & 1 ? 1 : -1) * gustX * along * 0.08;
          const targetY =
            prevY -
            (0.085 + (1 - scale) * 0.04) * lenScale * (1 + contract * 0.2) -
            kick * along * 0.015 * motionMul;
          const targetZ =
            prevZ +
            Math.sin(az + along * 0.35) * along * 0.02 * lenScale +
            Math.cos(swayT * 0.9) * swayAmp * 0.85 +
            (phase > 0.5 ? 1 : -1) * gustZ * along * 0.08;

          // Deeper segments lag more — inertia thickens toward the tips.
          const lagTau = (0.05 + along * 0.12) * (1 + still * 2.5);
          const curX = tp[pi] ?? targetX;
          const curY = tp[pi + 1] ?? targetY;
          const curZ = tp[pi + 2] ?? targetZ;
          const nx = smoothToward(curX, targetX, dt, lagTau, lagTau);
          const ny = smoothToward(curY, targetY, dt, lagTau, lagTau);
          const nz = smoothToward(curZ, targetZ, dt, lagTau, lagTau);
          tp[pi] = nx;
          tp[pi + 1] = ny;
          tp[pi + 2] = nz;
          tentArr[pi] = nx;
          tentArr[pi + 1] = ny;
          tentArr[pi + 2] = nz;

          // Tip plankton ticks on hats — sparse, not a wash.
          const tip = s === segCount - 1 ? 1 : 0;
          const tickSelect = hash01(phase * 19.1 + ti * 3.7 + i * 0.13) > 0.62 ? 1 : 0;
          const tipSpark = 1 + tip * tickSelect * hat * (1.35 + m.shimmer * 0.4);

          mixC
            .copy(baseCol)
            .lerp(glowC, 0.15 + (1 - along) * 0.25 + kick * 0.12)
            .lerp(milkC, tender * 0.5 + still * 0.18)
            .lerp(echoC, echoPulse * (0.55 + along * 0.25));
          const fade =
            (1 - along * 0.55) * (0.7 + swell * 0.25) * tipSpark * hush * (1 + echoPulse * 0.55);
          tentCol[pi] = Math.min(1, mixC.r * fade);
          tentCol[pi + 1] = Math.min(1, mixC.g * fade);
          tentCol[pi + 2] = Math.min(1, mixC.b * fade);

          prevX = nx;
          prevY = ny;
          prevZ = nz;
        }
      }
    }

    bells.instanceMatrix.needsUpdate = true;
    if (bells.instanceColor) bells.instanceColor.needsUpdate = true;
    tentPosAttr.needsUpdate = true;
    tentColAttr.needsUpdate = true;

    // Optional plankton motes — mid/high only; low drops them.
    const planks = plankRef.current;
    const plankMat = plankMatRef.current;
    if (planks && plankMat && planktonCount > 0) {
      const pPos = planks.geometry.getAttribute('position') as THREE.BufferAttribute;
      const pCol = planks.geometry.getAttribute('color') as THREE.BufferAttribute;
      const pArr = pPos.array as Float32Array;
      const pCArr = pCol.array as Float32Array;
      plankMat.size = 0.028 + hat * 0.02 + swell * 0.008;
      plankMat.opacity = Math.min(0.85, 0.22 + hat * 0.45 + swell * 0.1) * (1 - still * 0.5);

      for (let i = 0; i < planktonCount; i++) {
        const i3 = i * 3;
        const p = planktonPhases[i]!;
        const orbit = t * (0.15 + p * 0.25) * motionMul + p * 12.0;
        const rr = 0.6 + p * 2.4;
        pArr[i3] = Math.cos(orbit) * rr + Math.sin(t * 0.4 + p * 8) * snare * 0.15;
        pArr[i3 + 1] =
          Y_MIN +
          0.4 +
          ((Math.sin(t * (0.3 + p) + p * 5) * 0.5 + 0.5) * (Y_MAX - Y_MIN - 0.8));
        pArr[i3 + 2] = Math.sin(orbit) * rr * 0.9 + Math.cos(t * 0.35 + p * 6) * snare * 0.1;

        const spark = hash01(p * 31.7 + Math.floor(t * 6 + i)) > 0.72 ? hat : hat * 0.15;
        mixC.copy(highC).lerp(milkC, 0.35 + tender * 0.4);
        const g = (0.35 + spark * 1.4) * (1 - still * 0.4);
        pCArr[i3] = Math.min(1, mixC.r * g);
        pCArr[i3 + 1] = Math.min(1, mixC.g * g);
        pCArr[i3 + 2] = Math.min(1, mixC.b * g);
      }
      pPos.needsUpdate = true;
      pCol.needsUpdate = true;
    }

    // Slow bloom yaw — living, never a storm spin.
    bells.rotation.y += dt * pace * calm * motionMul * (0.025 + m.mid * 0.02 + swell * 0.012) * (1 - tender * 0.4);
    tents.rotation.y = bells.rotation.y;
    if (planks) planks.rotation.y = bells.rotation.y;

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  return (
    <group ref={rootRef}>
      {/* Deep water volume — dark so bioluminescence reads. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, Y_MIN - 0.15, 0]}>
        <planeGeometry args={[14, 14, 1, 1]} />
        <meshBasicMaterial
          ref={waterMatRef}
          color="#020810"
          transparent
          opacity={0.65}
          depthWrite={false}
        />
      </mesh>

      <instancedMesh
        ref={bellRef}
        args={[bellGeo, bellMat, jellyCount]}
        frustumCulled={false}
      />

      <points ref={tentRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[tentPositions, 3]}
            count={tentPointCount}
          />
          <bufferAttribute attach="attributes-color" args={[tentColors, 3]} count={tentPointCount} />
        </bufferGeometry>
        <pointsMaterial
          ref={tentMatRef}
          size={0.06}
          map={sprite}
          sizeAttenuation
          transparent
          vertexColors
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {planktonCount > 0 ? (
        <points ref={plankRef}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[planktonPositions, 3]}
              count={planktonCount}
            />
            <bufferAttribute
              attach="attributes-color"
              args={[planktonColors, 3]}
              count={planktonCount}
            />
          </bufferGeometry>
          <pointsMaterial
            ref={plankMatRef}
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
    </group>
  );
}
