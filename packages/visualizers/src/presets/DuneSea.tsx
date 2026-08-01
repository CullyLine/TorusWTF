'use client';

/**
 * Dune Sea — moonlit desert at night: rolling ridgelines of fine luminous
 * sand under a deep indigo sky, wind-ripples crawling the slip faces.
 * Musical anatomy:
 *  - kick → sand plume off a varying crest (grains arc + settle with gravity)
 *  - snare → lateral wind gust shears ripple lines across the field
 *  - hat → tiny mica glints wink in the sand
 *  - gather → wind stills, dunes swell on the pre-beat inhale
 *  - tension → wind rises, low sand-haze thickens through the build
 *  - dropEvent → one full sandstorm veil sweeps the scene
 *  - tenderness → moonlight warms toward honey
 *  - holdBreath / deep silence → air goes dead-calm; drifting grains hang
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';
import { getDotTexture } from '../dotTexture';

const SURF_HIGH = 3200;
const SURF_MID = 1600;
const SURF_LOW = 700;

const AIR_HIGH = 720;
const AIR_MID = 360;
const AIR_LOW = 160;

const HAZE_HIGH = 480;
const HAZE_MID = 240;
const HAZE_LOW = 100;

const CREST_HIGH = 7;
const CREST_MID = 5;
const CREST_LOW = 4;

const X_SPAN = 5.6;
const Z_SPAN = 4.4;
const GRAVITY = 4.8;
const BASE_Y = -1.55;

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

export function DuneSeaScene({ analyser, palette, tier, speed = 1 }: VisualizerSceneProps) {
  const mods = useModulation();
  const rootRef = useRef<THREE.Group>(null);
  const surfRef = useRef<THREE.Points>(null);
  const surfMatRef = useRef<THREE.PointsMaterial>(null);
  const airRef = useRef<THREE.Points>(null);
  const airMatRef = useRef<THREE.PointsMaterial>(null);
  const hazeRef = useRef<THREE.Points>(null);
  const hazeMatRef = useRef<THREE.PointsMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();

  const surfCount = tier === 'high' ? SURF_HIGH : tier === 'mid' ? SURF_MID : SURF_LOW;
  const airCount = tier === 'high' ? AIR_HIGH : tier === 'mid' ? AIR_MID : AIR_LOW;
  const hazeCount = tier === 'high' ? HAZE_HIGH : tier === 'mid' ? HAZE_MID : HAZE_LOW;
  const crestCount = tier === 'high' ? CREST_HIGH : tier === 'mid' ? CREST_MID : CREST_LOW;
  const kitAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const tenderAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  const tensionAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const dropAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;

  const scratchBass = useRef(new THREE.Color());
  const scratchMid = useRef(new THREE.Color());
  const scratchHigh = useRef(new THREE.Color());
  const scratchMoon = useRef(new THREE.Color(0.62, 0.72, 0.92));
  const scratchSand = useRef(new THREE.Color(0.82, 0.72, 0.52));
  const scratchHoney = useRef(new THREE.Color(1.0, 0.78, 0.48));
  const scratchMica = useRef(new THREE.Color(0.92, 0.95, 1.0));
  const scratchStorm = useRef(new THREE.Color(0.55, 0.48, 0.38));
  const scratchMix = useRef(new THREE.Color());

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
  const windSmooth = useRef(0.35);
  const prevKick = useRef(0);
  const prevSnare = useRef(0);
  const timeRef = useRef(0);
  const ripplePhase = useRef(0);
  const snareGustDir = useRef(1);
  const lastCrest = useRef(-1);
  const stormTravel = useRef(1); // 0..1 traveling; >=1 idle
  const airCursor = useRef(0);

  // Live crest peaks (x,y,z) updated each frame — kick plume sources.
  const crestX = useRef(new Float32Array(crestCount));
  const crestY = useRef(new Float32Array(crestCount));
  const crestZ = useRef(new Float32Array(crestCount));
  const crestScores = useRef<{ i: number; s: number }[]>([]);

  const sprite = useMemo(() => getDotTexture(), []);

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const {
    surfPositions,
    surfColors,
    surfPhases,
    surfBands,
    surfBaseX,
    surfBaseZ,
    crestCenterZ,
    crestAmp,
    crestSigma,
    crestPhase,
    airPositions,
    airColors,
    airVel,
    airLife,
    airActive,
    hazePositions,
    hazeColors,
    hazePhases,
  } = useMemo(() => {
    const sp = new Float32Array(surfCount * 3);
    const sc = new Float32Array(surfCount * 3);
    const ph = new Float32Array(surfCount);
    const bands = new Uint8Array(surfCount);
    const bx = new Float32Array(surfCount);
    const bz = new Float32Array(surfCount);

    const cz = new Float32Array(crestCount);
    const ca = new Float32Array(crestCount);
    const cs = new Float32Array(crestCount);
    const cph = new Float32Array(crestCount);

    crestX.current = new Float32Array(crestCount);
    crestY.current = new Float32Array(crestCount);
    crestZ.current = new Float32Array(crestCount);
    crestScores.current = Array.from({ length: crestCount }, (_, i) => ({ i, s: 0 }));

    for (let c = 0; c < crestCount; c++) {
      const t = crestCount === 1 ? 0.5 : c / (crestCount - 1);
      cz[c] = -Z_SPAN * 0.48 + t * Z_SPAN * 0.96;
      ca[c] = 0.55 + hash01(c * 1.7 + 0.3) * 0.85;
      cs[c] = 0.38 + hash01(c * 2.3 + 1.1) * 0.42;
      cph[c] = hash01(c * 3.1 + 2.2) * Math.PI * 2;
    }

    for (let i = 0; i < surfCount; i++) {
      const seed = i * 1.6180339887;
      const x = (hash01(seed + 0.11) - 0.5) * X_SPAN;
      const z = (hash01(seed + 0.37) - 0.5) * Z_SPAN;
      bx[i] = x;
      bz[i] = z;
      ph[i] = hash01(seed + 2.3);
      bands[i] = i % 3;
      sp[i * 3] = x;
      sp[i * 3 + 1] = BASE_Y;
      sp[i * 3 + 2] = z;
      sc[i * 3] = 0.55;
      sc[i * 3 + 1] = 0.5;
      sc[i * 3 + 2] = 0.42;
    }

    const ap = new Float32Array(airCount * 3);
    const ac = new Float32Array(airCount * 3);
    const av = new Float32Array(airCount * 3);
    const al = new Float32Array(airCount);
    const aa = new Uint8Array(airCount);
    for (let i = 0; i < airCount; i++) {
      ap[i * 3] = 0;
      ap[i * 3 + 1] = -40;
      ap[i * 3 + 2] = 0;
      al[i] = 0;
      aa[i] = 0;
    }

    const hp = new Float32Array(hazeCount * 3);
    const hc = new Float32Array(hazeCount * 3);
    const hph = new Float32Array(hazeCount);
    for (let i = 0; i < hazeCount; i++) {
      const seed = i * 2.718281828 + 9.1;
      hp[i * 3] = (hash01(seed) - 0.5) * X_SPAN * 1.15;
      hp[i * 3 + 1] = BASE_Y + 0.05 + hash01(seed + 0.4) * 1.35;
      hp[i * 3 + 2] = (hash01(seed + 0.7) - 0.5) * Z_SPAN * 1.1;
      hph[i] = hash01(seed + 1.3);
      hc[i * 3] = 0.4;
      hc[i * 3 + 1] = 0.35;
      hc[i * 3 + 2] = 0.28;
    }

    return {
      surfPositions: sp,
      surfColors: sc,
      surfPhases: ph,
      surfBands: bands,
      surfBaseX: bx,
      surfBaseZ: bz,
      crestCenterZ: cz,
      crestAmp: ca,
      crestSigma: cs,
      crestPhase: cph,
      airPositions: ap,
      airColors: ac,
      airVel: av,
      airLife: al,
      airActive: aa,
      hazePositions: hp,
      hazeColors: hc,
      hazePhases: hph,
    };
  }, [surfCount, airCount, hazeCount, crestCount]);

  const duneHeightAt = (
    x: number,
    z: number,
    t: number,
    swell: number,
    gather: number,
    wind: number,
    snareShear: number,
  ) => {
    let h = 0;
    for (let c = 0; c < crestCount; c++) {
      const ridgeZ = crestCenterZ[c]!;
      const dist = z - ridgeZ;
      const sigma = crestSigma[c]!;
      // Asymmetric slip face: steeper lee (positive Z).
      const lee = dist > 0 ? 1.35 : 0.85;
      const profile = Math.exp((-dist * dist * lee) / (2 * sigma * sigma));
      const undulation = 1 + 0.14 * Math.sin(x * 1.35 + crestPhase[c]! + t * 0.08);
      const ripple =
        0.045 *
        Math.sin(x * 7.2 + ripplePhase.current + z * 2.4 + snareShear * 3.5) *
        profile *
        (0.55 + wind * 0.7);
      h += crestAmp[c]! * profile * undulation + ripple;
    }
    // Soft secondary cross-ripples so the field never reads as static stripes.
    h += 0.06 * Math.sin(x * 0.55 + z * 1.1 + t * 0.12 * wind);
    const swellMul = 1 + swell * 0.22 + gather * 0.38;
    return BASE_Y + h * swellMul;
  };

  const emitGrain = (
    sx: number,
    sy: number,
    sz: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
  ) => {
    // Ring-buffer reuse — no alloc, no scan past one full pass.
    for (let n = 0; n < airCount; n++) {
      const i = (airCursor.current + n) % airCount;
      if (airActive[i]) continue;
      airCursor.current = (i + 1) % airCount;
      const i3 = i * 3;
      airPositions[i3] = sx;
      airPositions[i3 + 1] = sy;
      airPositions[i3 + 2] = sz;
      airVel[i3] = vx;
      airVel[i3 + 1] = vy;
      airVel[i3 + 2] = vz;
      airLife[i] = life;
      airActive[i] = 1;
      return;
    }
  };

  useFrame((_state, delta) => {
    const surf = surfRef.current;
    const surfMat = surfMatRef.current;
    const air = airRef.current;
    const airMat = airMatRef.current;
    const haze = hazeRef.current;
    const hazeMat = hazeMatRef.current;
    if (!surf || !surfMat || !air || !airMat || !haze || !hazeMat) return;

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
      stillnessTarget,
      dt,
      0.14,
      0.08,
    );
    const stillness = stillnessSmooth.current;
    const motionMul = 1 - stillness * 0.94;

    tenderSmooth.current = smoothToward(
      tenderSmooth.current,
      Math.min(1, m.tenderness) * tenderAmp,
      dt,
      0.12,
      0.22,
    );
    const tender = tenderSmooth.current;

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
    afterglowSmooth.current = smoothToward(afterglowSmooth.current, m.afterglow, dt, 0.18, 0.8);
    // Tension climbs the wind; drop springs it loose.
    const tensionTarget =
      m.dropEvent > 0.12 || m.release > 0.55 ? 0 : Math.min(1, m.tension) * tensionAmp;
    tensionSmooth.current = smoothToward(tensionSmooth.current, tensionTarget, dt, 0.1, 0.22);
    dropSmooth.current = smoothToward(
      dropSmooth.current,
      Math.min(1.2, m.dropEvent * 0.95 + m.impact * 0.35 + m.release * 0.12) * dropAmp,
      dt,
      0.03,
      0.22,
    );

    const gather = gatherSmooth.current;
    const kick = kickSmooth.current;
    const snare = snareSmooth.current;
    const hat = hatSmooth.current;
    const swell = swellSmooth.current;
    const tension = tensionSmooth.current;
    const drop = dropSmooth.current;
    const afterglow = afterglowSmooth.current;

    // Wind: base breeze + tension climb − gather stillness − holdBreath dead-calm.
    const windTarget = Math.max(
      0,
      (0.28 + m.energy * 0.25 + tension * 0.85 + snare * 0.35 - gather * 0.55) *
        (1 - stillness * 0.95) *
        (1 - tender * 0.35),
    );
    windSmooth.current = smoothToward(windSmooth.current, windTarget, dt, 0.08, 0.18);
    const wind = windSmooth.current;

    // Continuous clock freezes with the air; kit envelopes stay on full dt.
    timeRef.current += dt * pace * sectionPace * calm * motionMul * (1 - tender * 0.3);
    const t = timeRef.current;
    ripplePhase.current += dt * pace * calm * motionMul * (0.55 + wind * 2.4) * (1 - gather * 0.7);

    // Snare edge flips gust direction so successive cracks alternate.
    if (m.snare > 0.22 && prevSnare.current <= 0.22) {
      snareGustDir.current *= -1;
    }
    prevSnare.current = m.snare;

    // Update crest peaks — pick plume sources from live ridgelines.
    for (let c = 0; c < crestCount; c++) {
      const z = crestCenterZ[c]!;
      // Peak slightly offset along X so kicks don't always hit the same spot.
      const x =
        Math.sin(t * 0.07 + crestPhase[c]! + c * 1.7) * X_SPAN * 0.28 +
        Math.sin(t * 0.031 + c) * 0.45;
      const y = duneHeightAt(x, z, t, swell, gather, wind, snare * snareGustDir.current);
      crestX.current[c] = x;
      crestY.current[c] = y;
      crestZ.current[c] = z;
    }

    // Kick rising edge → sand plume off a *different* crest each strike.
    const kickEdge = m.kick > 0.28 && prevKick.current <= 0.28;
    prevKick.current = m.kick;
    if (kickEdge && stillness < 0.55) {
      const bpm = m.bpm && m.bpm > 40 ? m.bpm : 120;
      const barSlot = m.barPhase != null ? m.barPhase : (t * (bpm / 60) * 0.25) % 1;
      for (let c = 0; c < crestCount; c++) {
        const score =
          hash01(c * 7.13 + barSlot * 11.7 + lastCrest.current * 3.1) +
          (c === lastCrest.current ? -1.5 : 0) +
          Math.sin(t * 0.4 + c) * 0.15;
        crestScores.current[c]!.i = c;
        crestScores.current[c]!.s = score;
      }
      crestScores.current.sort((a, b) => b.s - a.s);
      const pick = crestScores.current[0]!.i;
      lastCrest.current = pick;
      const sx = crestX.current[pick]!;
      const sy = crestY.current[pick]! + 0.04;
      const sz = crestZ.current[pick]!;
      const burst = Math.floor((28 + kick * 36) * kitAmp * calm);
      for (let n = 0; n < burst; n++) {
        const seed = n * 1.618 + t * 17.3 + pick * 4.7;
        const ang = hash01(seed) * Math.PI * 2;
        const speedR = 0.35 + hash01(seed + 1) * 1.1;
        const up = 1.6 + hash01(seed + 2) * 2.4 + kick * 1.2;
        emitGrain(
          sx + (hash01(seed + 3) - 0.5) * 0.22,
          sy + hash01(seed + 4) * 0.08,
          sz + (hash01(seed + 5) - 0.5) * 0.18,
          Math.cos(ang) * speedR,
          up,
          Math.sin(ang) * speedR * 0.85,
          0.85 + hash01(seed + 6) * 0.55,
        );
      }
    }

    // Sparse idle wind births — a living breeze between kicks.
    if (wind > 0.2 && stillness < 0.4 && hash01(t * 40.3) < 0.08 * wind * calm) {
      const ci = Math.floor(hash01(t * 9.1) * crestCount) % crestCount;
      const sx = crestX.current[ci]! + (hash01(t * 3.3) - 0.5) * 1.2;
      const sz = crestZ.current[ci]! + (hash01(t * 5.1) - 0.5) * 0.35;
      const sy = duneHeightAt(sx, sz, t, swell, gather, wind, snare * snareGustDir.current) + 0.02;
      emitGrain(
        sx,
        sy,
        sz,
        (0.4 + wind) * (0.6 + hash01(t * 2.1)) * (hash01(t * 1.7) > 0.5 ? 1 : -1),
        0.15 + hash01(t * 4.4) * 0.35,
        (hash01(t * 6.2) - 0.5) * 0.25,
        0.55 + hash01(t * 8.8) * 0.4,
      );
    }

    // Drop → arm a full sandstorm veil that sweeps once across +X.
    if (drop > 0.45 && stormTravel.current >= 1) {
      stormTravel.current = 0;
    }
    if (stormTravel.current < 1) {
      const bpm = m.bpm && m.bpm > 40 ? m.bpm : 120;
      const beatSec = 60 / bpm;
      stormTravel.current = Math.min(1, stormTravel.current + dt / (beatSec * 2.4));
    }
    const storming = stormTravel.current < 1;
    const stormPulse = storming ? Math.sin(stormTravel.current * Math.PI) : 0;

    // —— Surface ridgelines ——
    const sPos = surf.geometry.getAttribute('position') as THREE.BufferAttribute;
    const sCol = surf.geometry.getAttribute('color') as THREE.BufferAttribute;
    const sArr = sPos.array as Float32Array;
    const sColArr = sCol.array as Float32Array;

    scratchBass.current.set(palette.bass);
    scratchMid.current.set(palette.mid);
    scratchHigh.current.set(palette.high);
    const moon = scratchMoon.current;
    const sand = scratchSand.current;
    const honey = scratchHoney.current;
    const mica = scratchMica.current;
    const mix = scratchMix.current;

    // Soft under stillness so holdBreath owns the hush; tender warms moonlight.
    const moonWarm = tender * 0.72;
    const hushDim = 1 - stillness * 0.35;

    for (let i = 0; i < surfCount; i++) {
      const i3 = i * 3;
      const x0 = surfBaseX[i]!;
      const z0 = surfBaseZ[i]!;
      // Snare shears the ripple field laterally — lines crawl across the face.
      const shear = snare * snareGustDir.current * 0.22;
      const x = x0 + shear * Math.sin(z0 * 2.1 + t * 0.5);
      const z = z0;
      const y = duneHeightAt(x, z, t, swell, gather, wind, shear * 4);
      sArr[i3] = x;
      sArr[i3 + 1] = y;
      sArr[i3 + 2] = z;

      const band = surfBands[i]!;
      const phase = surfPhases[i]!;
      const base =
        band === 0 ? scratchBass.current : band === 1 ? scratchMid.current : scratchHigh.current;
      mix.copy(base).lerp(sand, 0.55).lerp(moon, 0.28 + phase * 0.12);
      mix.lerp(honey, moonWarm * (0.45 + phase * 0.25));

      // Hat mica glints — sparse wink select, never a full-field flash.
      const micaSel = hash01(i * 0.173 + Math.floor(t * 6.5)) > 0.965 - hat * 0.04;
      const micaFlash = micaSel ? hat * (0.55 + phase * 0.45) : 0;
      if (micaFlash > 0.02) mix.lerp(mica, Math.min(1, micaFlash * 1.1));

      // Kick crest brighten near the active plume source.
      if (kick > 0.08 && lastCrest.current >= 0) {
        const cx = crestX.current[lastCrest.current]!;
        const cz = crestZ.current[lastCrest.current]!;
        const dx = x - cx;
        const dz = z - cz;
        const near = Math.exp(-(dx * dx + dz * dz) * 1.8);
        mix.lerp(mica, near * kick * 0.35);
      }

      const lum = hushDim * (0.72 + swell * 0.12 + gather * 0.1 + afterglow * 0.08);
      sColArr[i3] = Math.min(1, mix.r * lum);
      sColArr[i3 + 1] = Math.min(1, mix.g * lum);
      sColArr[i3 + 2] = Math.min(1, mix.b * lum);
    }
    sPos.needsUpdate = true;
    sCol.needsUpdate = true;

    surfMat.size = (0.038 + gather * 0.01 + kick * 0.008) * (0.9 + kitAmp * 0.1);
    surfMat.opacity = Math.min(1, 0.72 + swell * 0.1) * hushDim;

    // —— Airborne grains (plumes + breeze) ——
    const aPos = air.geometry.getAttribute('position') as THREE.BufferAttribute;
    const aCol = air.geometry.getAttribute('color') as THREE.BufferAttribute;
    const aArr = aPos.array as Float32Array;
    const aColArr = aCol.array as Float32Array;

    const gustX = snare * snareGustDir.current * 2.8 * kitAmp;
    let liveAir = 0;

    for (let i = 0; i < airCount; i++) {
      const i3 = i * 3;
      if (!airActive[i]) {
        aArr[i3] = 0;
        aArr[i3 + 1] = -40;
        aArr[i3 + 2] = 0;
        aColArr[i3] = 0;
        aColArr[i3 + 1] = 0;
        aColArr[i3 + 2] = 0;
        continue;
      }

      // HoldBreath hangs grains mid-air — integrate velocity only when the wind lives.
      if (motionMul > 0.04) {
        airVel[i3]! += gustX * dt * 0.85;
        airVel[i3]! += wind * 0.35 * dt * (hash01(i * 0.31 + 1.2) - 0.35);
        airVel[i3 + 1]! -= GRAVITY * dt * motionMul;
        airVel[i3]! *= 1 - dt * 0.35;
        airVel[i3 + 2]! *= 1 - dt * 0.35;

        aArr[i3]! += airVel[i3]! * dt * pace * calm * motionMul;
        aArr[i3 + 1]! += airVel[i3 + 1]! * dt * pace * calm * motionMul;
        aArr[i3 + 2]! += airVel[i3 + 2]! * dt * pace * calm * motionMul;
        airLife[i]! -= dt * (0.55 + (1 - motionMul) * 0.15);
      }

      const gx = aArr[i3]!;
      const gy = aArr[i3 + 1]!;
      const gz = aArr[i3 + 2]!;
      const ground = duneHeightAt(gx, gz, t, swell, gather, wind, snare * snareGustDir.current);

      // Settle into the slip face; hang mid-air never settles.
      if (airLife[i]! <= 0 || gy < ground - 0.02 || gy > 4.5 || Math.abs(gx) > X_SPAN * 0.72) {
        if (stillness < 0.5 || airLife[i]! <= 0) {
          airActive[i] = 0;
          aArr[i3 + 1] = -40;
          continue;
        }
      }

      liveAir++;
      const lifeFade = Math.max(0, Math.min(1, airLife[i]!));
      mix.copy(sand).lerp(moon, 0.35).lerp(honey, moonWarm * 0.55);
      const bright = (0.55 + kick * 0.25 + lifeFade * 0.45) * hushDim;
      aColArr[i3] = Math.min(1, mix.r * bright);
      aColArr[i3 + 1] = Math.min(1, mix.g * bright);
      aColArr[i3 + 2] = Math.min(1, mix.b * bright);
    }
    aPos.needsUpdate = true;
    aCol.needsUpdate = true;

    airMat.size = (0.032 + kick * 0.02) * (0.9 + kitAmp * 0.1);
    airMat.opacity = Math.min(
      1,
      (liveAir > 0 ? 0.55 + kick * 0.35 : 0.05) * hushDim * (0.55 + motionMul * 0.45),
    );

    // —— Sand haze / storm veil ——
    const hPos = haze.geometry.getAttribute('position') as THREE.BufferAttribute;
    const hCol = haze.geometry.getAttribute('color') as THREE.BufferAttribute;
    const hArr = hPos.array as Float32Array;
    const hColArr = hCol.array as Float32Array;
    const stormC = scratchStorm.current;
    const hazeAmt = Math.max(tension * 0.75, stormPulse * dropAmp, drop * 0.25) * (1 - stillness * 0.7);

    for (let i = 0; i < hazeCount; i++) {
      const i3 = i * 3;
      const phase = hazePhases[i]!;
      const baseX = (hash01(i * 2.1 + 0.2) - 0.5) * X_SPAN * 1.15;
      const baseZ = (hash01(i * 3.3 + 0.5) - 0.5) * Z_SPAN * 1.1;
      const baseY = BASE_Y + 0.08 + phase * 1.45;

      let x = baseX + wind * Math.sin(t * 0.4 + phase * 6) * 0.35;
      let y = baseY;
      let z = baseZ + snare * snareGustDir.current * 0.15 * Math.sin(phase * 8);

      if (storming) {
        // Sweeping veil: grains organize into a traveling sheet along +X.
        const slot = ((phase + i * 0.017) % 1 + 1) % 1;
        const crestDist = Math.abs(slot - stormTravel.current);
        const crestWrap = Math.min(crestDist, 1 - crestDist);
        const inSheet = Math.exp(-crestWrap * crestWrap * 28);
        x = -X_SPAN * 0.55 + stormTravel.current * X_SPAN * 1.15 + (phase - 0.5) * 0.55;
        y = BASE_Y + 0.15 + phase * 1.8 * (0.6 + inSheet * 0.5);
        z = (hash01(i * 1.9) - 0.5) * Z_SPAN * (0.7 + inSheet * 0.4);
        const vis = hazeAmt * (0.25 + inSheet * 0.9) * stormPulse;
        mix.copy(stormC).lerp(sand, 0.4).lerp(honey, moonWarm * 0.3);
        hColArr[i3] = Math.min(1, mix.r * vis);
        hColArr[i3 + 1] = Math.min(1, mix.g * vis);
        hColArr[i3 + 2] = Math.min(1, mix.b * vis);
      } else {
        const vis = hazeAmt * (0.15 + phase * 0.55) * (0.4 + tension * 0.6);
        mix.copy(stormC).lerp(sand, 0.35).lerp(moon, 0.2).lerp(honey, moonWarm * 0.35);
        hColArr[i3] = Math.min(1, mix.r * vis);
        hColArr[i3 + 1] = Math.min(1, mix.g * vis);
        hColArr[i3 + 2] = Math.min(1, mix.b * vis);
        if (vis < 0.02) {
          y = -40;
        }
      }

      hArr[i3] = x;
      hArr[i3 + 1] = y;
      hArr[i3 + 2] = z;
    }
    hPos.needsUpdate = true;
    hCol.needsUpdate = true;

    hazeMat.size = (0.07 + tension * 0.04 + stormPulse * 0.05) * (0.85 + kitAmp * 0.15);
    hazeMat.opacity = Math.min(0.85, 0.08 + hazeAmt * 0.72);

    // Slow desert turn — alive, never a carnival spin; freezes on holdBreath.
    if (rootRef.current) {
      rootRef.current.rotation.y +=
        dt * pace * calm * motionMul * (1 - tender * 0.45) * (0.025 + m.mid * 0.02 + wind * 0.015);
    }

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  return (
    <group ref={rootRef}>
      <points ref={hazeRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[hazePositions, 3]} count={hazeCount} />
          <bufferAttribute attach="attributes-color" args={[hazeColors, 3]} count={hazeCount} />
        </bufferGeometry>
        <pointsMaterial
          ref={hazeMatRef}
          size={0.08}
          map={sprite}
          sizeAttenuation
          transparent
          vertexColors
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          opacity={0.1}
        />
      </points>
      <points ref={surfRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[surfPositions, 3]} count={surfCount} />
          <bufferAttribute attach="attributes-color" args={[surfColors, 3]} count={surfCount} />
        </bufferGeometry>
        <pointsMaterial
          ref={surfMatRef}
          size={0.04}
          map={sprite}
          sizeAttenuation
          transparent
          vertexColors
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      <points ref={airRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[airPositions, 3]} count={airCount} />
          <bufferAttribute attach="attributes-color" args={[airColors, 3]} count={airCount} />
        </bufferGeometry>
        <pointsMaterial
          ref={airMatRef}
          size={0.035}
          map={sprite}
          sizeAttenuation
          transparent
          vertexColors
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          opacity={0.2}
        />
      </points>
    </group>
  );
}
