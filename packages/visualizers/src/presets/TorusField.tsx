'use client';

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

/** EMA toward target with separate rise/fall time constants. */
function smoothToward(
  current: number,
  target: number,
  dt: number,
  riseTau: number,
  fallTau: number,
): number {
  const tau = target > current ? riseTau : fallTau;
  const a = 1 - Math.exp(-dt / Math.max(1e-4, tau));
  return current + (target - current) * a;
}

/**
 * Amber residue mixed into tube colors while afterglow decays.
 * Max mix at afterglow=1 — residual warmth, not a full wash.
 */
const AFTERGLOW_AMBER = new THREE.Color(1.0, 0.58, 0.28);
const AFTERGLOW_WARMTH_MIX = 0.38;
/** Ease tau for color-temperature linger (fluid, not stair-stepped). */
const AFTERGLOW_WARMTH_TAU = 0.35;

/** Bias a tube color toward amber by eased afterglow; quiet (0) is a no-op. */
function applyAfterglowWarmth(
  color: THREE.Color,
  warmthLinger: number,
  scratchAmber: THREE.Color,
  mix = AFTERGLOW_WARMTH_MIX,
): void {
  const t = Math.max(0, Math.min(1, warmthLinger)) * mix;
  if (t < 0.001) return;
  color.lerp(scratchAmber.copy(AFTERGLOW_AMBER), t);
}

/**
 * Torus Field — brand torus with kit accents + phrase-echo reverse.
 *  - gather → shell inhale (existing breath)
 *  - leanIn → mild inward pull on major radius / presence (pre-drop anticipation)
 *  - kick → tube pulse (wire + particle tube radius)
 *  - snare → lateral flash / X crack on the point cloud
 *  - hat → outer point-cloud size ticks
 *  - echo → one reverse of flow drift in post-phrase gaps
 *  - afterglow → residual amber color temperature on tube emissive
 *  - holdBreath / deep silence → suspend flow + rotation to a hang; dim the
 *    particle tube toward a still ember ring; thaw on the music's return
 *  - convergence → phase-aligned ring lattice: flow steadies, rings sharpen,
 *    the field locks in with the band; soft release as lock fades
 */

/** Discrete major-ring count for convergence lattice snap. */
const LOCK_RING_COUNT = 28;
/** Discrete tube-slot count around each ring cross-section. */
const LOCK_TUBE_SLOTS = 18;
const LOCK_RING_STEP = (Math.PI * 2) / LOCK_RING_COUNT;
const LOCK_TUBE_STEP = (Math.PI * 2) / LOCK_TUBE_SLOTS;
export function TorusFieldScene({ analyser, palette, tier, speed = 1 }: VisualizerSceneProps) {
  const mods = useModulation();
  const torusRef = useRef<THREE.Mesh>(null);
  const particlesRef = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();
  // Flow Field Update: particles lift off the torus surface along the
  // shared curl current, then settle back — the energy field made liquid.
  const flowParamsRef = useRef<FlowParams>({ ...DEFAULT_FLOW_PARAMS });
  const flowTimeRef = useRef(0);
  const flowScratch = useRef<Vec3Like>({ x: 0, y: 0, z: 0 });
  const scratchBass = useRef(new THREE.Color());
  const scratchMid = useRef(new THREE.Color());
  const scratchHigh = useRef(new THREE.Color());
  const scratchAmber = useRef(new THREE.Color());
  // Color-temperature linger tracks afterglow (intensity path unchanged).
  const warmthLingerRef = useRef(0);

  // Kit envelopes + one-shot phrase-echo reverse drift.
  const kickSmooth = useRef(0);
  const snareSmooth = useRef(0);
  const hatSmooth = useRef(0);
  const echoSmooth = useRef(0);
  const echoTravel = useRef(1); // 0..1 traveling; >=1 idle
  const echoArmed = useRef(true);
  const prevEcho = useRef(0);
  // Lean-in anticipation: ease inward so pre-drop tension reads as a held pull.
  // Slower fall than rise so the approach lingers into the drop (Aura-style).
  const leanSmooth = useRef(0);
  // Hold-breath stillness — freeze continuous flow/spin; kit/echo stay ungated.
  const stillnessSmooth = useRef(0);
  // Convergence lock — phase-align into a crisp ring lattice when bands lock.
  const lockSmooth = useRef(0);

  const particleCount = tier === 'high' ? 6000 : tier === 'mid' ? 2500 : 800;
  // Low tier keeps gestures readable without strobing sparse points.
  const kitAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const echoAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  // Stillness amp: full hang on high; slightly softer on mid/low.
  const stillAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  // Lock amp: full lattice snap on high; slightly softer on mid/low.
  const lockAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  // Soften amber mix on sparse low tier so bloom doesn’t blow out.
  const warmthMix =
    (tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1) * AFTERGLOW_WARMTH_MIX;
  const sprite = useMemo(() => getDotTexture(), []);

  const { positions, baseTheta, basePhi } = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    const t = new Float32Array(particleCount);
    const p = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 2;
      t[i] = theta;
      p[i] = phi;
      setTorusPoint(pos, i * 3, theta, phi, 1.4, 0.5);
    }
    return { positions: pos, baseTheta: t, basePhi: p };
  }, [particleCount]);

  const colorAttr = useMemo(() => {
    const c = new Float32Array(particleCount * 3);
    const bass = new THREE.Color(palette.bass);
    const mid = new THREE.Color(palette.mid);
    const high = new THREE.Color(palette.high);
    for (let i = 0; i < particleCount; i++) {
      const t = (i / particleCount) % 1;
      const color = t < 0.33 ? bass : t < 0.66 ? mid : high;
      c[i * 3] = color.r;
      c[i * 3 + 1] = color.g;
      c[i * 3 + 2] = color.b;
    }
    return c;
  }, [particleCount, palette]);

  useFrame((_state, delta) => {
    const torus = torusRef.current;
    const points = particlesRef.current;
    const pointsMat = matRef.current;
    if (!torus || !points || !pointsMat) return;

    const m = metricsRef.current;
    const spd = mods.current.speed ?? speed;
    const dtClamped = Math.min(delta, 0.05);

    // Hold-breath stillness: the field listens instead of spinning through quiet.
    // Rise a touch slower than fall so the freeze feels attentive; thaw
    // promptly when music returns so kit / echo accents still fire.
    const stillnessTarget =
      Math.min(
        1,
        Math.max(m.holdBreath, m.silence * 0.92) + Math.min(m.holdBreath, m.silence) * 0.15,
      ) * stillAmp;
    stillnessSmooth.current = smoothToward(
      stillnessSmooth.current,
      stillnessTarget,
      dtClamped,
      0.14,
      0.08,
    );
    const stillness = stillnessSmooth.current;
    // Nearly freeze continuous flow / rotation; leave a whisper so thaw never pops.
    const motionMul = 1 - stillness * 0.92;
    // Hat ticks held mid-hang (distinct from ungated kick/snare punches).
    const hatMul = 1 - stillness * 0.95;
    // Soft hush dim — cool ember ring, distinct from afterglow amber warmth.
    const emberDim = 1 - stillness * 0.42;

    // Smooth kit envelopes so punches feel fluid, not gated snaps.
    // Kick/snare stay ungated so the heartbeat/crack still land through hush.
    kickSmooth.current = smoothToward(
      kickSmooth.current,
      Math.min(1.2, m.kick) * kitAmp,
      dtClamped,
      0.018,
      0.14,
    );
    snareSmooth.current = smoothToward(
      snareSmooth.current,
      Math.min(1.2, m.snare) * kitAmp,
      dtClamped,
      0.016,
      0.11,
    );
    hatSmooth.current = smoothToward(
      hatSmooth.current,
      Math.min(1.2, m.hat) * kitAmp,
      dtClamped,
      0.012,
      0.055,
    );
    // LeanIn: fast climb into anticipation, slower release into the drop.
    // Soft under stillness so the hang owns quiet bars (approach ≠ freeze).
    leanSmooth.current = smoothToward(leanSmooth.current, m.leanIn, dtClamped, 0.06, 0.18);
    const lean = leanSmooth.current * (1 - stillness * 0.35);

    // Convergence lock: eager into the chord (~0.1s), softer release (~0.18s)
    // so the lattice dissolves without a snap. Soft under stillness so the
    // hang owns quiet (lock ≠ freeze); kit / leanIn / echo stay distinct.
    lockSmooth.current = smoothToward(
      lockSmooth.current,
      Math.min(1, Math.max(0, m.convergence ?? 0)) * lockAmp,
      dtClamped,
      0.1,
      0.18,
    );
    const lock = lockSmooth.current * (1 - stillness * 0.3);
    // Power curve: early lock stays loose; choruses snap into clean rings.
    const lockSnap = lock * lock;
    // Steadier continuous drive when locked — not frozen (holdBreath owns that).
    const lockPace = 1 - lock * 0.38;

    // One reverse drift per echo impulse — arm on quiet, fire on rise.
    echoSmooth.current = smoothToward(echoSmooth.current, m.echo * echoAmp, dtClamped, 0.05, 0.3);
    const echoNow = echoSmooth.current;
    if (echoNow < 0.08) echoArmed.current = true;
    if (echoArmed.current && echoNow > 0.22 && prevEcho.current <= 0.22) {
      echoTravel.current = 0;
      echoArmed.current = false;
    }
    prevEcho.current = echoNow;
    if (echoTravel.current < 1) {
      const bpm = m.bpm ?? 120;
      echoTravel.current = Math.min(1, echoTravel.current + dtClamped * (0.85 + bpm / 180));
    }
    const traveling = echoTravel.current < 1;
    // Fades from full reverse (−1) back to forward (1) over the travel.
    const reverseAmt = traveling ? echoSmooth.current * (1 - echoTravel.current) : 0;
    const flowSign = 1 - reverseAmt * 2;

    // Color-temperature linger tracks afterglow — quiet verses leave tubes untinted.
    warmthLingerRef.current +=
      (m.afterglow - warmthLingerRef.current) * (1 - Math.exp(-dtClamped / AFTERGLOW_WARMTH_TAU));

    // Section pacing: the field turns with the song's arc — near-still in
    // valleys, flying at peaks. Tenderness (vocal-led soft passages) eases
    // the pace further so intimate moments feel held, not spun.
    // motionMul suspends continuous drive during holdBreath (kit stays ungated).
    // lockPace steadies the spin when bands lock (alive cohesion, not hush).
    const sectionPace = (0.65 + m.sectionLevel * 0.55) * (1 - m.tenderness * 0.25);
    const flowSpeed =
      delta *
      spd *
      (0.35 + m.mid * 3 + m.impact * 2) *
      sectionPace *
      flowSign *
      motionMul *
      lockPace;
    const activeRatio = 0.45 + m.flow * 0.55;

    // Gather: the pre-beat inhale pulls the shell in a breath before each
    // predicted hit, so downbeats read as exhale-release.
    // LeanIn: milder section-scale pull (stacks with gather; never replaces it).
    // Kick: tube pulse — shell thickens/blooms on the kick envelope.
    const kickTube = kickSmooth.current * 0.12;
    const leanPull = lean * 0.038;
    const shellBase = 1 + m.bass * 0.3 + m.impact * 0.18 - m.gather * 0.05 - leanPull;
    torus.scale.set(
      shellBase + kickTube * 0.35,
      shellBase + kickTube,
      shellBase + kickTube * 0.35,
    );
    // Continuous spin hangs under stillness; kit snare Z roll stays ungated.
    torus.rotation.y += flowSpeed * 0.4;
    torus.rotation.x += delta * spd * (0.03 + m.high * 0.2) * motionMul;
    // Snare: brief lateral roll on the wire shell.
    torus.rotation.z = snareSmooth.current * 0.09 * (Math.sin(m.barPhase * Math.PI * 2) || 1);

    // Downbeat flash: peaks at the start of each 4/4 bar then decays in <0.5 beats.
    const barFlash = m.barPhase > 0 ? Math.pow(1 - m.barPhase, 8) : 0;
    // Drop punch: big momentary flare when a bass drop is detected.
    const dropPunch = m.dropEvent * 1.4;
    // Silence mute: ease emissive down during sustained silence.
    const silenceMute = 1 - m.silence * 0.75;

    const torusMat = torus.material;
    if (torusMat && !Array.isArray(torusMat) && 'emissiveIntensity' in torusMat) {
      const sm = torusMat as THREE.MeshStandardMaterial;
      // Afterglow holds the shell warm for seconds after a peak — the room
      // still ringing after the chorus ends. Kick blooms the tube; snare
      // flashes mid laterally via a short emissive kick.
      // emberDim hushes the shell toward a still coal under holdBreath
      // (distinct from afterglow amber color temperature).
      sm.emissiveIntensity =
        (0.35 +
          m.swell * 0.7 +
          m.impact * 0.5 +
          barFlash * 0.6 +
          dropPunch +
          m.afterglow * 0.4 +
          kickSmooth.current * 0.55 +
          snareSmooth.current * 0.4) *
        silenceMute *
        emberDim;
      // Follow the living palette so the shell breathes color too.
      // After peaks: bias toward amber while afterglow decays (intensity
      // afterglow above stays; this is residual color temperature).
      sm.color.set(palette.mid);
      sm.emissive.set(palette.mid);
      applyAfterglowWarmth(sm.color, warmthLingerRef.current, scratchAmber.current, warmthMix);
      applyAfterglowWarmth(sm.emissive, warmthLingerRef.current, scratchAmber.current, warmthMix);
      sm.opacity =
        (0.2 + m.swell * 0.2 + m.afterglow * 0.06 + kickSmooth.current * 0.06) * emberDim;
    }

    // Hat ticks: sharp size glitter on the outer point cloud.
    // hatMul holds ticks mid-air during holdBreath (thaw restores sparkle).
    // Lock slightly tightens point size so the lattice reads as crisp lines.
    const hatTick = hatSmooth.current * hatMul;
    pointsMat.size =
      0.05 + m.swell * 0.05 + m.impact * 0.04 + hatTick * 0.055 - lock * 0.012;
    // Dim the particle tube toward a still ember ring under hush.
    // Lock lifts opacity a touch so locked rings read denser / cleaner.
    pointsMat.opacity = Math.min(
      1,
      (0.75 + m.swell * 0.25 + hatTick * 0.18 + lock * 0.1) * emberDim,
    );

    // Re-tint particle bands from the living palette (mutates in place, so
    // the mount-time buffer would otherwise stay frozen forever).
    const cAttr = points.geometry.getAttribute('color') as THREE.BufferAttribute;
    const cArr = cAttr.array as Float32Array;
    const bassC = scratchBass.current.set(palette.bass);
    const midC = scratchMid.current.set(palette.mid);
    const highC = scratchHigh.current.set(palette.high);
    // Particle tube shares the amber linger so the whole field cools together.
    applyAfterglowWarmth(bassC, warmthLingerRef.current, scratchAmber.current, warmthMix);
    applyAfterglowWarmth(midC, warmthLingerRef.current, scratchAmber.current, warmthMix);
    applyAfterglowWarmth(highC, warmthLingerRef.current, scratchAmber.current, warmthMix);
    const bassGain = (1 + m.impact * 0.2 + kickSmooth.current * 0.35) * emberDim;
    const midGain = (1 + m.mid * 0.2 + snareSmooth.current * 0.4) * emberDim;
    // Hat gain also holds under stillness so sparkle doesn't strobe mid-hang.
    const highGain = (1 + m.shimmer * 0.35 + hatTick * 0.55) * emberDim;
    for (let i = 0; i < particleCount; i++) {
      const t = (i / particleCount) % 1;
      const color = t < 0.33 ? bassC : t < 0.66 ? midC : highC;
      const gain = t < 0.33 ? bassGain : t < 0.66 ? midGain : highGain;
      const i3 = i * 3;
      cArr[i3] = Math.min(1, color.r * gain);
      cArr[i3 + 1] = Math.min(1, color.g * gain);
      cArr[i3 + 2] = Math.min(1, color.b * gain);
    }
    cAttr.needsUpdate = true;

    const posAttr = points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;

    // Shared flow current: off-surface drift that grows with the music and
    // vanishes at rest, so the sacred geometry stays clean when calm.
    // Echo reverses the curl once in post-phrase gaps, then resumes.
    // Continuous curl clock freezes with the field; echo reverse still flips sign.
    // lockPace steadies the curl clock when bands lock (distinct from freeze).
    flowTimeRef.current +=
      dtClamped *
      spd *
      (0.4 + Math.min(m.energy, 1.5) * 0.4) *
      flowSign *
      motionMul *
      lockPace;
    const fp = flowParamsFromMetrics(m, flowParamsRef.current);
    fp.time = flowTimeRef.current;
    // Convergence power-locks bandSpread so choruses read as one lattice
    // (stronger than the linear map in flowParamsFromMetrics). Turbulence
    // hushes so the rings hold still without holdBreath's full freeze.
    fp.bandSpread = Math.pow(1 - lock, 2.25) * 0.9;
    fp.turbulence *= 1 - lock * 0.7;
    const flowLift =
      (0.05 + m.swell * 0.22 + m.dropEvent * 0.45 + m.afterglow * 0.06) *
      flowSign *
      motionMul *
      (1 - lock * 0.78);
    const fv = flowScratch.current;

    // Snare lateral crack amplitude (phase-split L/R across the cloud).
    const snareX = snareSmooth.current * 0.14;
    // Kick expands the particle tube radius — the ring thickens with the hit.
    const kickTubeR = kickSmooth.current * 0.18;
    // LeanIn anticipation: ease major radius + tube presence inward (distinct
    // from gather's shell-scale inhale and kick's tube bloom).
    const leanRadius = lean * 0.14;
    const leanTube = lean * 0.045;

    for (let i = 0; i < particleCount; i++) {
      if (i / particleCount > activeRatio) continue;
      basePhi[i] = (basePhi[i]! + flowSpeed) % (Math.PI * 2);
      // Theta advance steadies under lock so the lattice holds its phase.
      baseTheta[i] =
        (baseTheta[i]! +
          delta *
            spd *
            (0.15 + m.high * 1.2 + m.impact) *
            flowSign *
            motionMul *
            lockPace) %
        (Math.PI * 2);

      // Phase-aligned ring lattice: soft-snap phi/theta toward discrete slots
      // so a locked groove reads as clean ring lines (alive cohesion).
      let phi = basePhi[i]!;
      let theta = baseTheta[i]!;
      if (lockSnap > 0.01) {
        const snapPhi = Math.round(phi / LOCK_RING_STEP) * LOCK_RING_STEP;
        const snapTheta = Math.round(theta / LOCK_TUBE_STEP) * LOCK_TUBE_STEP;
        phi = phi + (snapPhi - phi) * lockSnap;
        theta = theta + (snapTheta - theta) * lockSnap;
      }

      // Mid wobble collapses under lock so rings sharpen (loose drift returns).
      const radius =
        1.4 +
        m.bass * 0.25 +
        Math.sin(phi * 3) * m.mid * 0.08 * (1 - lock * 0.92) -
        leanRadius;
      const tube = 0.5 + m.breath * 0.15 + kickTubeR - leanTube;
      const i3 = i * 3;
      setTorusPoint(arr, i3, theta, phi, radius, tube);
      sampleFlow(fv, arr[i3]!, arr[i3 + 1]!, arr[i3 + 2]!, i % 3, fp);
      arr[i3] = arr[i3]! + fv.x * flowLift;
      arr[i3 + 1] = arr[i3 + 1]! + fv.y * flowLift;
      arr[i3 + 2] = arr[i3 + 2]! + fv.z * flowLift;
      // Snare: lateral X crack — alternate sign by particle index.
      arr[i3] = arr[i3]! + snareX * (i % 2 === 0 ? 1 : -1);
    }
    posAttr.needsUpdate = true;

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  return (
    <>
      <mesh ref={torusRef}>
        <torusGeometry args={[1.4, 0.5, tier === 'low' ? 32 : 64, tier === 'low' ? 64 : 128]} />
        <meshStandardMaterial
          color={palette.mid}
          emissive={palette.mid}
          emissiveIntensity={0.35}
          metalness={0.6}
          roughness={0.35}
          wireframe
          transparent
          opacity={0.28}
        />
      </mesh>

      <points ref={particlesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
            count={particleCount}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[colorAttr, 3]}
            count={particleCount}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          ref={matRef}
          size={0.06}
          map={sprite}
          sizeAttenuation
          transparent
          opacity={0.9}
          vertexColors
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </>
  );
}

function setTorusPoint(
  arr: Float32Array,
  i: number,
  theta: number,
  phi: number,
  R: number,
  r: number,
) {
  const cos = Math.cos(phi);
  arr[i] = (R + r * Math.cos(theta)) * cos;
  arr[i + 1] = r * Math.sin(theta);
  arr[i + 2] = (R + r * Math.cos(theta)) * Math.sin(phi);
}
