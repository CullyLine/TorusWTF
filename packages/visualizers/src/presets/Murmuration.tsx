'use client';

/**
 * Murmuration — a starling flock at dusk.
 * Musical anatomy:
 *  - gather → banks the flock tighter with pre-beat anticipation
 *  - leanIn → flocks nearer the camera; ribbon tightens expectantly (pre-drop)
 *  - kick → contraction–expansion wave through the body
 *  - snare → shears heading laterally (world X)
 *  - hat → wingtip glints on selected birds
 *  - tenderness → golden-hour warm wash + gentler flight
 *  - holdBreath / deep silence → hang on still wings; thaw on return
 *  - echo → one-shot wing-glint ripple traveling bird-to-bird through the body
 *  - convergence → headings align + ribbon collapses into one sharp sheet;
 *    soft release as lock fades (alive cohesion with the band)
 *
 * Birds ride shared curl-noise currents with trailing velocity inertia and
 * banked turns — the flock is never a straight line, always a ribbon folding
 * over itself. When bands lock, that ribbon snaps into one coherent sheet.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';
import {
  DEFAULT_FLOW_PARAMS,
  flowParamsFromMetrics,
  sampleFlow,
  type FlowParams,
  type Vec3Like,
} from '../dsp/flowfield';
import { getDotTexture } from '../dotTexture';

const COUNT_HIGH = 4800;
const COUNT_MID = 2000;
const COUNT_LOW = 850;

const GLINT_HIGH = 280;
const GLINT_MID = 90;
const GLINT_LOW = 0;

const GOLDEN = /* @__PURE__ */ new THREE.Color(1.0, 0.72, 0.38);
const DUSK = /* @__PURE__ */ new THREE.Color(0.08, 0.05, 0.12);
/** Cool catch-light for phrase-echo — cooler than golden-hour / hat sparks. */
const ECHO_GLINT = /* @__PURE__ */ new THREE.Color(0.78, 0.92, 1.0);

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

function wrapPi(a: number) {
  const t = (a + Math.PI) % (Math.PI * 2);
  return t < 0 ? t + Math.PI * 2 - Math.PI : t - Math.PI;
}

const _dummy = /* @__PURE__ */ new THREE.Object3D();
const _color = /* @__PURE__ */ new THREE.Color();

export function MurmurationScene({ analyser, palette, tier, speed = 1 }: VisualizerSceneProps) {
  const mods = useModulation();
  const rootRef = useRef<THREE.Group>(null);
  const flockRef = useRef<THREE.InstancedMesh>(null);
  const glintRef = useRef<THREE.Points>(null);
  const glintMatRef = useRef<THREE.PointsMaterial>(null);
  const hazeMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();

  const birdCount = tier === 'high' ? COUNT_HIGH : tier === 'mid' ? COUNT_MID : COUNT_LOW;
  const glintCount = tier === 'high' ? GLINT_HIGH : tier === 'mid' ? GLINT_MID : GLINT_LOW;
  // Low tier skips wingtip glints and uses coarser cone segments — simpler wings.
  const coneSegs = tier === 'high' ? 5 : tier === 'mid' ? 4 : 3;
  const kitAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const stillAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const tenderAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  const leanAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  const echoAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  // Lock amp: full sheet snap on high; slightly softer on mid/low.
  const lockAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;

  const flowParamsRef = useRef<FlowParams>({ ...DEFAULT_FLOW_PARAMS });
  const flowTimeRef = useRef(0);
  const flowScratch = useRef<Vec3Like>({ x: 0, y: 0, z: 0 });

  const scratchBass = useRef(new THREE.Color());
  const scratchMid = useRef(new THREE.Color());
  const scratchHigh = useRef(new THREE.Color());
  const scratchMix = useRef(new THREE.Color());
  const scratchEcho = useRef(new THREE.Color().copy(ECHO_GLINT));
  const scratchHaze = useRef(new THREE.Color().copy(DUSK));

  const gatherSmooth = useRef(0);
  const kickSmooth = useRef(0);
  const snareSmooth = useRef(0);
  const hatSmooth = useRef(0);
  const tenderSmooth = useRef(0);
  const stillnessSmooth = useRef(0);
  const afterglowSmooth = useRef(0);
  // LeanIn anticipation: eager climb, slower release into the drop.
  const leanSmooth = useRef(0);
  // Phrase-echo one-shot: arm on quiet, fire one bird-to-bird glint ripple.
  const echoSmooth = useRef(0);
  const echoTravel = useRef(1); // 0..1 traveling; >=1 idle
  const echoArmed = useRef(true);
  const prevEcho = useRef(0);
  // Convergence lock — headings align into one sharp ribbon sheet.
  const lockSmooth = useRef(0);

  // Per-bird state: position, velocity, heading, bank (trailing inertia).
  const pos = useRef(new Float32Array(birdCount * 3));
  const vel = useRef(new Float32Array(birdCount * 3));
  const heading = useRef(new Float32Array(birdCount));
  const bank = useRef(new Float32Array(birdCount));

  const sprite = useMemo(() => getDotTexture(), []);

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const { phases, sizes, bands, glintOf } = useMemo(() => {
    const p = pos.current;
    const v = vel.current;
    const h = heading.current;
    const bk = bank.current;
    const ph = new Float32Array(birdCount);
    const sz = new Float32Array(birdCount);
    const b = new Uint8Array(birdCount);
    const gOf = new Int32Array(Math.max(glintCount, 1));

    for (let i = 0; i < birdCount; i++) {
      const seed = i * 1.6180339887;
      // Seed as a soft ribbon volume — elongated dusk murmuration shape.
      const u = hash01(seed + 0.11);
      const along = (u - 0.5) * 5.4;
      const spread = 0.35 + hash01(seed + 0.37) * 1.55;
      const ang = hash01(seed + 0.71) * Math.PI * 2;
      const y = (hash01(seed + 1.3) - 0.5) * 2.4;
      p[i * 3] = Math.cos(ang) * spread + along * 0.15;
      p[i * 3 + 1] = y;
      p[i * 3 + 2] = Math.sin(ang) * spread * 0.85 + along;
      // Initial heading roughly along +Z with soft scatter.
      const hx = (hash01(seed + 2.1) - 0.5) * 0.35;
      const hz = 0.75 + hash01(seed + 2.5) * 0.4;
      const hy = (hash01(seed + 2.9) - 0.5) * 0.2;
      const inv = 1 / Math.sqrt(hx * hx + hy * hy + hz * hz);
      v[i * 3] = hx * inv * 0.9;
      v[i * 3 + 1] = hy * inv * 0.9;
      v[i * 3 + 2] = hz * inv * 0.9;
      h[i] = Math.atan2(hx, hz);
      bk[i] = 0;
      ph[i] = hash01(seed + 3.7);
      b[i] = i % 3;
      sz[i] = 0.75 + hash01(seed + 4.1) * 0.65;
    }

    // Spread glints across the flock (high/mid only).
    for (let g = 0; g < glintCount; g++) {
      gOf[g] = Math.floor(hash01(g * 2.718 + 0.2) * birdCount) % birdCount;
    }

    pos.current = p;
    vel.current = v;
    heading.current = h;
    bank.current = bk;

    return { phases: ph, sizes: sz, bands: b, glintOf: gOf };
  }, [birdCount, glintCount]);

  const glintPositions = useMemo(
    () => new Float32Array(Math.max(glintCount, 1) * 3),
    [glintCount],
  );
  const glintColors = useMemo(
    () => new Float32Array(Math.max(glintCount, 1) * 3),
    [glintCount],
  );

  const birdGeo = useMemo(() => {
    // Tip along −Z so Object3D.lookAt / YXZ heading points the beak forward.
    const geo = new THREE.ConeGeometry(0.028, 0.11, coneSegs);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [coneSegs]);

  const birdMat = useMemo(
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

  useFrame((_state, delta) => {
    const mesh = flockRef.current;
    if (!mesh) return;
    void analyser;
    void freqBuf;

    const m = metricsRef.current;
    const spd = mods.current.speed ?? speed;
    const dt = Math.min(delta, 0.05);
    const motionScale = reducedMotion ? 0.35 : 1;

    // Hold-breath: hang on still wings.
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
    const motionMul = 1 - stillness * 0.94;
    const hatMul = 1 - stillness * 0.95;

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

    // Phrase-echo: arm on quiet, fire one bird-to-bird wing-glint ripple per gap.
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
      const echoPace = 0.9 + spd * 0.15;
      echoTravel.current = Math.min(1, echoTravel.current + dt * echoPace * (0.85 + bpm / 180));
    }
    const traveling = echoTravel.current < 1;
    // Idle nearly silent so speaking passages never sticky-glow.
    const echoVis = traveling
      ? echoSmooth.current * (1 - echoTravel.current * 0.3)
      : echoSmooth.current * 0.04;

    // Convergence lock: eager into the chord (~0.1s), softer release (~0.18s)
    // so the sheet dissolves without a snap. Soft under stillness so the hang
    // owns quiet (lock ≠ freeze); gather/leanIn/kit/echo stay distinct.
    lockSmooth.current = smoothToward(
      lockSmooth.current,
      Math.min(1, Math.max(0, m.convergence ?? 0)) * lockAmp,
      dt,
      0.1,
      0.18,
    );
    const lock = lockSmooth.current * (1 - stillness * 0.3);
    // Power curve: early lock stays loose; choruses snap into one sheet.
    const lockSnap = lock * lock;
    // Steadier continuous drive when locked — not frozen (holdBreath owns that).
    const lockPace = 1 - lock * 0.38;

    const gather = gatherSmooth.current;
    const kick = kickSmooth.current;
    const snare = snareSmooth.current;
    const hat = hatSmooth.current * hatMul;
    const tender = tenderSmooth.current;
    const afterglow = afterglowSmooth.current;
    const calm = 1 - tender * 0.55;

    // Draw nearer on leanIn — mild camera-ward pull, distinct from gather's
    // centroid bank. Soft scale so the ribbon fills the frame expectantly.
    const root = rootRef.current;
    if (root) {
      root.position.z = -lean * 0.55;
      const leanScale = 1 + lean * 0.08;
      root.scale.setScalar(leanScale);
    }

    // Curl clock — freezes with the flock under holdBreath; lockPace steadies
    // (does not freeze) when bands lock so the sheet holds without hush.
    flowTimeRef.current +=
      dt *
      spd *
      (0.45 + Math.min(m.energy, 1.5) * 0.35) *
      motionMul *
      motionScale *
      lockPace;
    const fp = flowParamsFromMetrics(m, flowParamsRef.current);
    fp.time = flowTimeRef.current;
    fp.turbulence *= (1 - tender * 0.65) * (1 - lock * 0.7);
    fp.swirl *= (1 - tender * 0.4) * (0.85 + gather * 0.35) * (1 - lock * 0.25);
    // Gather banks tighter: more vortex cohesion, less band spread scatter.
    // LeanIn coils the ribbon a touch more (expectant) without stealing gather.
    // Convergence power-locks bandSpread so choruses read as one sheet
    // (stronger than the linear map in flowParamsFromMetrics).
    fp.vortex = (fp.vortex + gather * 0.85 + lean * 0.45 + lock * 0.55) * (0.7 + calm * 0.3);
    fp.bandSpread = Math.pow(1 - lock, 2.25) * fp.bandSpread * (1 - gather * 0.85 - lean * 0.35);

    const flowAmount =
      dt *
      spd *
      (0.55 + m.swell * 0.55 + m.dropEvent * 0.9) *
      calm *
      motionMul *
      motionScale *
      lockPace;
    const inertia = 1 - Math.exp(-dt / Math.max(0.04, 0.11 + tender * 0.08 - lock * 0.045)); // trailing turn lag; snappier under lock
    const bankInertia = 1 - Math.exp(-dt / 0.09);
    const gatherPull = 1 - gather * dt * 1.35;
    // LeanIn: gentle ribbon coil toward center — softer and slower than gather.
    const leanPull = 1 - lean * dt * 0.55;
    // Convergence: soft planar coil so the sheet draws tight without gather's inhale.
    const lockPull = 1 - lockSnap * dt * 0.4;
    const snareShear = snare * dt * 4.6;
    const kickWave = kick;
    const fv = flowScratch.current;

    const bassC = scratchBass.current.set(palette.bass);
    const midC = scratchMid.current.set(palette.mid);
    const highC = scratchHigh.current.set(palette.high);
    const echoC = scratchEcho.current.copy(ECHO_GLINT);
    // Golden-hour wash on tenderness — distinct from holdBreath hush dim.
    if (tender > 0.001) {
      const warm = GOLDEN;
      const mix = tender * 0.55;
      bassC.lerp(warm, mix);
      midC.lerp(warm, mix * 0.9);
      highC.lerp(warm, mix * 0.75);
    }
    if (afterglow > 0.001) {
      const warm = GOLDEN;
      bassC.lerp(warm, afterglow * 0.18);
      midC.lerp(warm, afterglow * 0.14);
    }

    const hushDim = 1 - stillness * 0.32;
    const pArr = pos.current;
    const vArr = vel.current;
    const hArr = heading.current;
    const bArr = bank.current;

    // Soft centroid + mean heading for gather anticipation / convergence lock
    // (cheap every-N sample). Mean velocity gives the shared sheet direction.
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let mvx = 0;
    let mvy = 0;
    let mvz = 0;
    const stride = birdCount > 2400 ? 4 : birdCount > 1200 ? 2 : 1;
    let samples = 0;
    for (let i = 0; i < birdCount; i += stride) {
      cx += pArr[i * 3]!;
      cy += pArr[i * 3 + 1]!;
      cz += pArr[i * 3 + 2]!;
      mvx += vArr[i * 3]!;
      mvy += vArr[i * 3 + 1]!;
      mvz += vArr[i * 3 + 2]!;
      samples++;
    }
    const invS = 1 / Math.max(1, samples);
    cx *= invS;
    cy *= invS;
    cz *= invS;
    mvx *= invS;
    mvy *= invS;
    mvz *= invS;
    const meanSp = Math.sqrt(mvx * mvx + mvy * mvy + mvz * mvz) + 1e-5;
    const meanHx = mvx / meanSp;
    const meanHy = mvy / meanSp;
    const meanHz = mvz / meanSp;

    for (let i = 0; i < birdCount; i++) {
      const i3 = i * 3;
      let x = pArr[i3]!;
      let y = pArr[i3 + 1]!;
      let z = pArr[i3 + 2]!;
      let vx = vArr[i3]!;
      let vy = vArr[i3 + 1]!;
      let vz = vArr[i3 + 2]!;

      const band = bands[i]!;
      sampleFlow(fv, x, y, z, band, fp);

      // Desired flight direction: curl current + soft ribbon cohesion.
      let dx = fv.x;
      let dy = fv.y * 0.85;
      let dz = fv.z;
      // Gather: bank toward centroid (pre-beat inhale) — not a hard snap.
      if (gather > 0.01) {
        dx += (cx - x) * gather * 1.8;
        dy += (cy - y) * gather * 1.4;
        dz += (cz - z) * gather * 1.8;
      }
      // LeanIn: softer inward coil — expectant tighten, not gather's inhale.
      if (lean > 0.01) {
        dx += (cx - x) * lean * 0.75;
        dy += (cy - y) * lean * 0.55;
        dz += (cz - z) * lean * 0.75;
      }
      // Convergence: align headings toward flock mean — the sheet locks in.
      // Distinct from gather/leanIn (those pull position; this steers heading).
      if (lock > 0.01) {
        const align = lockSnap * 2.4;
        dx += meanHx * align;
        dy += meanHy * align * 0.7;
        dz += meanHz * align;
        // Flatten into one coherent ribbon plane (alive sheet, not a ball).
        dy += (cy - y) * lockSnap * 1.6;
        // Soft lateral draw so the ribbon reads as one sharply-drawn line.
        dx += (cx - x) * lockSnap * 0.55;
        dz += (cz - z) * lockSnap * 0.55;
      }
      // Soft keep-alive so the ribbon never stalls into a straight coast.
      // Under lock, breathe less — the sheet holds stiller without freezing.
      const breath = (0.15 + phases[i]! * 0.1) * (1 - lock * 0.72);
      dx += Math.sin(flowTimeRef.current * 0.7 + phases[i]! * 12.0) * breath * 0.08;
      dy += Math.cos(flowTimeRef.current * 0.55 + phases[i]! * 9.0) * breath * 0.05;

      const dLen = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-5;
      const cruise = (1.15 + m.energy * 0.55 + m.swell * 0.35) * calm * (0.55 + motionMul * 0.45);
      const tx = (dx / dLen) * cruise;
      const ty = (dy / dLen) * cruise;
      const tz = (dz / dLen) * cruise;

      // Trailing inertia — headings lag the current (banked turns, no pops).
      vx += (tx - vx) * inertia;
      vy += (ty - vy) * inertia;
      vz += (tz - vz) * inertia;

      // Kick: contraction–expansion wave radiates through the body.
      if (kickWave > 0.01) {
        const rx = x - cx;
        const ry = y - cy;
        const rz = z - cz;
        const dist = Math.sqrt(rx * rx + ry * ry + rz * rz) + 1e-4;
        const phase = dist * 0.85 - kickWave * 2.2;
        const wave = Math.sin(phase * Math.PI) * kickWave;
        // Negative wave = contract; positive = expand — one fluid pulse.
        const impulse = -wave * 2.8 * dt;
        vx += (rx / dist) * impulse;
        vy += (ry / dist) * impulse * 0.7;
        vz += (rz / dist) * impulse;
      }

      // Snare: lateral heading shear (world X) — distinct from kick radial.
      vx += snareShear * (band === 1 ? 1.15 : band === 0 ? 0.85 : 1.0) * (i % 2 === 0 ? 1 : -1);

      // Soft speed clamp so inertia doesn't runaway after kit punches.
      const sp2 = vx * vx + vy * vy + vz * vz;
      const maxSp = 3.2 * calm + kick * 0.6;
      if (sp2 > maxSp * maxSp) {
        const inv = maxSp / Math.sqrt(sp2);
        vx *= inv;
        vy *= inv;
        vz *= inv;
      }

      // Integrate + gather spatial bank + leanIn ribbon coil + lock sheet draw.
      x = (x + vx * flowAmount * 1.15) * gatherPull * leanPull * lockPull;
      y = (y + vy * flowAmount * 1.15) * gatherPull * leanPull * lockPull;
      z = (z + vz * flowAmount * 1.15) * gatherPull * leanPull * lockPull;

      // Soft bounds — flock folds back as a ribbon, never hard walls.
      // LeanIn gently shrinks the play volume (expectant coil).
      // Lock flattens the Y bound so the sheet reads as one plane.
      const bound = 3.6 * (1 - lean * 0.12 - lock * 0.08);
      const yBound = 2.6 * (1 - lockSnap * 0.35);
      if (x > bound || x < -bound) vx *= -0.35;
      if (y > yBound || y < -yBound) vy *= -0.35;
      if (z > bound || z < -bound) vz *= -0.35;
      x = Math.max(-bound * 1.05, Math.min(bound * 1.05, x));
      y = Math.max(-yBound * 1.06, Math.min(yBound * 1.06, y));
      z = Math.max(-bound * 1.05, Math.min(bound * 1.05, z));

      pArr[i3] = x;
      pArr[i3 + 1] = y;
      pArr[i3 + 2] = z;
      vArr[i3] = vx;
      vArr[i3 + 1] = vy;
      vArr[i3 + 2] = vz;

      const spdNow = Math.sqrt(vx * vx + vy * vy + vz * vz) + 1e-5;
      const yaw = Math.atan2(vx, vz);
      const pitch = -Math.asin(Math.max(-1, Math.min(1, vy / spdNow)));
      const turn = wrapPi(yaw - hArr[i]!) / Math.max(dt, 1e-4);
      hArr[i] = yaw;
      // Bank into the turn; gather + leanIn tighten max bank (coiled ribbon).
      // Convergence steadies bank toward a clean sheet (distinct from hush).
      const bankTarget = Math.max(
        -1.15,
        Math.min(
          1.15,
          -turn * 0.22 * (1 + gather * 0.35 + lean * 0.28) * (1 - lock * 0.55),
        ),
      );
      bArr[i] = bArr[i]! + (bankTarget - bArr[i]!) * bankInertia;
      // Still wings: ease bank toward level under holdBreath.
      if (stillness > 0.01) {
        bArr[i] = bArr[i]! * (1 - stillness * 0.08);
      }
      // Lock: gently level the sheet without freezing (holdBreath owns hang).
      if (lock > 0.01) {
        bArr[i] = bArr[i]! * (1 - lockSnap * 0.06);
      }

      // Phrase-echo crest: sweep bird-to-bird by phase so one cool catch-light
      // ripple answers the gap — memory traveling through the flock body.
      const birdSlot = ((phases[i]! + i * 0.07) % 1 + 1) % 1;
      const crestDist = Math.abs(birdSlot - echoTravel.current);
      const crestWrap = Math.min(crestDist, 1 - crestDist);
      const crestEnv = traveling
        ? Math.exp(-crestWrap * crestWrap * 55) *
          (0.4 +
            0.6 *
              Math.max(
                0,
                Math.sin(echoTravel.current * Math.PI * 10 + phases[i]! * 18.0),
              ))
        : 0;
      const echoPulse = echoVis * crestEnv * (1 - stillness * 0.55);

      const birdScale =
        (0.85 + sizes[i]! * 0.35) *
        (1 + kick * 0.08 * Math.sin((phases[i]! + kick) * Math.PI)) *
        (1 + echoPulse * 0.12);
      _dummy.position.set(x, y, z);
      _dummy.rotation.set(pitch, yaw, bArr[i]!, 'YXZ');
      _dummy.scale.setScalar(birdScale);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);

      const base = band === 0 ? bassC : band === 1 ? midC : highC;
      const gain =
        (0.72 + m.swell * 0.28 + hat * 0.12 + afterglow * 0.1 + echoPulse * 0.85) *
        hushDim *
        (band === 2 ? 1 + hat * 0.35 : 1);
      _color.copy(base).multiplyScalar(gain);
      // Echo reply → cool silver catch-light (cooler than golden tenderness).
      if (echoPulse > 0.001) {
        _color.lerp(echoC, echoPulse * 0.72);
      }
      mesh.setColorAt(i, _color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // Lock slightly sharpens opacity so the sheet reads as one clean ribbon.
    birdMat.opacity = Math.min(
      1,
      (0.82 + m.swell * 0.12 + afterglow * 0.08 + lock * 0.1) * hushDim,
    );

    // Wingtip glints — hat ticks spark selected tips (high/mid); echo crest
    // rides the same tips as cool catch-lights so the ripple reads on wings.
    if (glintCount > 0) {
      const gPos = glintPositions;
      const gCol = glintColors;
      const glints = glintRef.current;
      const gMat = glintMatRef.current;
      for (let g = 0; g < glintCount; g++) {
        const bi = glintOf[g]!;
        const i3 = bi * 3;
        const g3 = g * 3;
        // Offset along banked right wing (approx world X from heading).
        const yaw = hArr[bi]!;
        const bk = bArr[bi]!;
        const wing = 0.07 + sizes[bi]! * 0.02;
        gPos[g3] = pArr[i3]! + Math.cos(yaw) * wing * (g % 2 === 0 ? 1 : -1);
        gPos[g3 + 1] = pArr[i3 + 1]! + bk * 0.03;
        gPos[g3 + 2] = pArr[i3 + 2]! - Math.sin(yaw) * wing * (g % 2 === 0 ? 1 : -1);

        const birdSlot = ((phases[bi]! + bi * 0.07) % 1 + 1) % 1;
        const crestDist = Math.abs(birdSlot - echoTravel.current);
        const crestWrap = Math.min(crestDist, 1 - crestDist);
        const crestEnv = traveling
          ? Math.exp(-crestWrap * crestWrap * 55) *
            (0.4 +
              0.6 *
                Math.max(
                  0,
                  Math.sin(echoTravel.current * Math.PI * 10 + phases[bi]! * 18.0),
                ))
          : 0;
        const echoPulse = echoVis * crestEnv * (1 - stillness * 0.55);

        const spark =
          0.25 +
          hat * 1.4 +
          echoPulse * 1.8 +
          (phases[bi]! < 0.08 + hat * 0.2 ? 0.55 : 0);
        const gc = scratchMix.current
          .copy(highC)
          .lerp(GOLDEN, tender * 0.4)
          .lerp(ECHO_GLINT, echoPulse * 0.85);
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
        gMat.size = 0.035 + hat * 0.055 + m.shimmer * 0.02 + echoVis * 0.03;
        gMat.opacity = Math.min(
          1,
          (0.35 + hat * 0.55 + m.shimmer * 0.15 + echoVis * 0.45) * hushDim,
        );
      }
    }

    if (hazeMatRef.current) {
      scratchHaze.current.copy(DUSK).lerp(GOLDEN, tender * 0.35 + afterglow * 0.12);
      hazeMatRef.current.color.copy(scratchHaze.current);
      hazeMatRef.current.opacity = (0.22 + tender * 0.12) * hushDim;
    }
  });

  return (
    <group ref={rootRef}>
      {/* Soft dusk haze disc — atmosphere under the ribbon, not a card. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.85, 0]}>
        <circleGeometry args={[6.5, 48]} />
        <meshBasicMaterial
          ref={hazeMatRef}
          color={DUSK}
          transparent
          opacity={0.22}
          depthWrite={false}
        />
      </mesh>

      <instancedMesh
        ref={flockRef}
        args={[birdGeo, birdMat, birdCount]}
        frustumCulled={false}
      />

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
            size={0.04}
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
