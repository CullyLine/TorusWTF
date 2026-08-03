'use client';

/**
 * Ember Drift — rising warm ashfield between Particle Storm chaos and
 * Star Field dust. Musical anatomy:
 *  - swell → embers lift faster / brighter through choruses
 *  - gather → inhale toward the vertical center before the beat
 *  - impact → soft flare (size + warmth), not a strobe
 *  - kick → upward lift punch through the ash column
 *  - snare → lateral ash shear (phase-split L/R)
 *  - hat → sparse tick sparkles on selected embers
 *  - holdBreath / deep silence → freeze mid-air + dim toward coals; thaw upward
 *  - tenderness → slow the rise, gentle the drift, warm toward rosy soft coals
 *    (a gentling, not a stop — distinct from holdBreath freeze)
 *  - echo → one-shot train of cool blue-white sparks that climbs through the
 *    warm ash, replaying the phrase gap then cooling/fading (memory at a
 *    different temperature)
 *  - leanIn → densify the ash column + drift nearer with faint brightening
 *    (pre-drop anticipation; distinct from gather's pulsed inhale)
 *  - barPhase → slow bar-locked coal flicker so the field glows on the music's
 *    clock (continuous unwrap, no stepping)
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';
import { getDotTexture } from '../dotTexture';

const COUNT_HIGH = 4800;
const COUNT_MID = 2200;
const COUNT_LOW = 900;

/** Phrase-echo spark train — cool blue-white memory, not warm ash ticks. */
const SPARK_HIGH = 42;
const SPARK_MID = 28;
const SPARK_LOW = 16;

const Y_MIN = -2.8;
const Y_MAX = 2.9;
const Y_SPAN = Y_MAX - Y_MIN;

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

export function EmberDriftScene({ analyser, palette, tier, speed = 1 }: VisualizerSceneProps) {
  const mods = useModulation();
  const rootRef = useRef<THREE.Group>(null);
  const ref = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);
  const sparkRef = useRef<THREE.Points>(null);
  const sparkMatRef = useRef<THREE.PointsMaterial>(null);
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const metricsRef = useMetricsRef();
  const baseCount = tier === 'high' ? COUNT_HIGH : tier === 'mid' ? COUNT_MID : COUNT_LOW;
  const sparkCount = tier === 'high' ? SPARK_HIGH : tier === 'mid' ? SPARK_MID : SPARK_LOW;
  const kitAmp = tier === 'low' ? 0.75 : tier === 'mid' ? 0.9 : 1;
  const tenderAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  const echoAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  // LeanIn / bar-clock amps — mid/low still approach and breathe, just softer.
  const leanAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;
  const barAmp = tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1;

  const scratchBass = useRef(new THREE.Color());
  const scratchMid = useRef(new THREE.Color());
  const scratchHigh = useRef(new THREE.Color());
  const scratchWarm = useRef(new THREE.Color(1, 0.55, 0.22));
  const scratchCoal = useRef(new THREE.Color(0.18, 0.08, 0.04));
  // Rosy soft coals — tender passages milk toward honey-rose, not dark hush.
  const scratchRosy = useRef(new THREE.Color(1.0, 0.48, 0.42));
  // Cool blue-white phrase memory — distinct temperature from warm ash / rosy coals.
  const scratchEcho = useRef(new THREE.Color(0.55, 0.82, 1.0));
  const scratchMix = useRef(new THREE.Color());

  const gatherSmooth = useRef(0);
  const impactSmooth = useRef(0);
  const kickSmooth = useRef(0);
  const snareSmooth = useRef(0);
  const hatSmooth = useRef(0);
  const swellSmooth = useRef(0.15);
  const afterglowSmooth = useRef(0);
  // Hold-breath / deep-silence listen gate — freeze/thaw without pops.
  const stillnessSmooth = useRef(0);
  // Tenderness hush — gentles rise/drift + warms glow (still breathes).
  const tenderSmooth = useRef(0);
  // Phrase-echo one-shot: arm on quiet, fire one cool spark train per gap.
  const echoSmooth = useRef(0);
  const echoTravel = useRef(1); // 0..1 traveling; >=1 idle
  const echoArmed = useRef(true);
  const prevEcho = useRef(0);
  const echoSource = useRef({ x: 0, y: Y_MIN + 0.55, z: 0, seed: 0.37 });
  // LeanIn anticipation: densify + near approach before the drop.
  const leanSmooth = useRef(0);
  // Continuous unwrapped bar phase for coal flicker (no 0→1 step).
  const barTurnsRef = useRef(0);
  const prevBarPhaseRef = useRef(0);
  const hadBpmRef = useRef(false);
  const barFlickerSmooth = useRef(0);
  const timeRef = useRef(0);

  const sprite = useMemo(() => getDotTexture(), []);

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const { positions, velocities, phases, bands, sizes } = useMemo(() => {
    const p = new Float32Array(baseCount * 3);
    const v = new Float32Array(baseCount * 3);
    const ph = new Float32Array(baseCount);
    const b = new Uint8Array(baseCount);
    const sz = new Float32Array(baseCount);
    for (let i = 0; i < baseCount; i++) {
      const seed = i * 1.6180339887;
      const r = Math.sqrt(hash01(seed + 0.11)) * 2.35;
      const ang = hash01(seed + 0.37) * Math.PI * 2;
      p[i * 3] = Math.cos(ang) * r;
      p[i * 3 + 1] = Y_MIN + hash01(seed + 0.71) * Y_SPAN;
      p[i * 3 + 2] = Math.sin(ang) * r * 0.85;
      // Soft lateral drift + base rise — never the storm's thrash.
      v[i * 3] = (hash01(seed + 1.1) - 0.5) * 0.012;
      v[i * 3 + 1] = 0.35 + hash01(seed + 1.4) * 0.55;
      v[i * 3 + 2] = (hash01(seed + 1.7) - 0.5) * 0.012;
      ph[i] = hash01(seed + 2.3);
      b[i] = i % 3;
      sz[i] = 0.55 + hash01(seed + 2.9) * 0.9;
    }
    return { positions: p, velocities: v, phases: ph, bands: b, sizes: sz };
  }, [baseCount]);

  const colors = useMemo(() => {
    const c = new Float32Array(baseCount * 3);
    const bass = new THREE.Color(palette.bass);
    const mid = new THREE.Color(palette.mid);
    const high = new THREE.Color(palette.high);
    const warm = new THREE.Color(1, 0.55, 0.22);
    for (let i = 0; i < baseCount; i++) {
      const band = bands[i]!;
      const base = band === 0 ? bass : band === 1 ? mid : high;
      const ember = base.clone().lerp(warm, 0.45 + (phases[i] ?? 0) * 0.25);
      c[i * 3] = ember.r;
      c[i * 3 + 1] = ember.g;
      c[i * 3 + 2] = ember.b;
    }
    return c;
  }, [baseCount, palette, bands, phases]);

  // Phrase-echo spark train — parked offscreen until a gap fires.
  const { sparkPositions, sparkColors, sparkPhases } = useMemo(() => {
    const p = new Float32Array(sparkCount * 3);
    const c = new Float32Array(sparkCount * 3);
    const ph = new Float32Array(sparkCount);
    for (let i = 0; i < sparkCount; i++) {
      p[i * 3] = 0;
      p[i * 3 + 1] = -40;
      p[i * 3 + 2] = 0;
      ph[i] = hash01(i * 1.6180339887 + 4.7);
      c[i * 3] = 0;
      c[i * 3 + 1] = 0;
      c[i * 3 + 2] = 0;
    }
    return { sparkPositions: p, sparkColors: c, sparkPhases: ph };
  }, [sparkCount]);

  useFrame((_state, delta) => {
    const points = ref.current;
    const mat = matRef.current;
    if (!points || !mat) return;

    const m = metricsRef.current;
    const dt = Math.min(delta, 0.05);
    const pace = Math.max(0.05, mods.current.speed ?? speed);
    const calm = reducedMotion ? 0.4 : 1;
    const sectionPace = 0.78 + m.sectionLevel * 0.4;

    // Hold-breath stillness: the ashfield listens instead of rising through quiet.
    // Rise a touch slower than fall so the freeze feels attentive; thaw
    // promptly when music returns so kit / gather / impact still fire.
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
    // Nearly freeze continuous rise / wobble / sway; leave a whisper so thaw never pops.
    const motionMul = 1 - stillness * 0.9;

    // Tenderness hush — soft rise/fall so intimate passages ease into soft coals
    // without freezing (holdBreath stillness stays the freeze path).
    tenderSmooth.current = smoothToward(
      tenderSmooth.current,
      Math.min(1, m.tenderness) * tenderAmp,
      dt,
      0.12,
      0.22,
    );
    const tender = tenderSmooth.current;
    // Gentling, not a stop: slow the continuous loft + lateral drift while kit
    // punches stay on full envelopes so kick/snare still crack through.
    const tenderLiftMul = 1 - tender * 0.48;
    const tenderDriftMul = 1 - tender * 0.55;

    // Continuous clock freezes with the ash; kit envelopes stay on full dt.
    // Tenderness eases the clock a notch so the field feels held, not torn.
    timeRef.current += dt * pace * sectionPace * calm * motionMul * (1 - tender * 0.35);

    gatherSmooth.current = smoothToward(gatherSmooth.current, m.gather, dt, 0.04, 0.14);
    swellSmooth.current = smoothToward(swellSmooth.current, m.swell, dt, 0.12, 0.45);
    impactSmooth.current = smoothToward(
      impactSmooth.current,
      Math.min(1.2, m.impact * 0.95 + m.release * 0.18) * kitAmp,
      dt,
      0.03,
      0.16,
    );
    // Kit accents: kick lifts fast / falls medium; snare shears fast;
    // hats tick with a short fall so mote glitter stays crisp.
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

    // Phrase-echo: arm on quiet, fire one cool blue-white spark train per gap —
    // memory at a different temperature from the warm ash column.
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
      // Seed the climb near the hearth / mid-column so the train reads
      // upward through warm ash rather than at the horizon edge.
      const ash = ref.current;
      const posNow = ash
        ? ((ash.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array)
        : null;
      let best = 0;
      let bestScore = -1;
      const pickSeed = hash01(timeRef.current * 0.37 + echoNow * 11.3);
      const sample = Math.min(baseCount, 240);
      for (let i = 0; i < sample; i++) {
        const idx = Math.floor(hash01(i * 0.91 + pickSeed) * baseCount) % baseCount;
        const x = posNow?.[idx * 3] ?? 0;
        const y = posNow?.[idx * 3 + 1] ?? Y_MIN + 0.5;
        const z = posNow?.[idx * 3 + 2] ?? 0;
        const r = Math.hypot(x, z);
        const heightScore = 1 - Math.abs((y - Y_MIN) / Y_SPAN - 0.22) * 1.6;
        const score = heightScore + (1 - Math.min(1, r / 2.4)) * 0.55 + hash01(idx * 0.71 + pickSeed) * 0.35;
        if (score > bestScore) {
          bestScore = score;
          best = idx;
        }
      }
      echoSource.current = {
        x: posNow?.[best * 3] ?? 0,
        y: posNow?.[best * 3 + 1] ?? Y_MIN + 0.55,
        z: posNow?.[best * 3 + 2] ?? 0,
        seed: hash01(best * 1.91 + timeRef.current * 0.13),
      };
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

    // Continuous bar unwrap for coal flicker (no 0→1 step).
    const bpmKnown = Boolean(m.bpm && m.bpm > 30);
    const barPhase = bpmKnown ? Math.min(1, Math.max(0, m.barPhase)) : 0;
    if (bpmKnown) {
      if (prevBarPhaseRef.current - barPhase > 0.5) {
        barTurnsRef.current += 1;
      }
      prevBarPhaseRef.current = barPhase;
      if (!hadBpmRef.current) {
        barTurnsRef.current = 0;
        hadBpmRef.current = true;
      }
    } else if (hadBpmRef.current) {
      hadBpmRef.current = false;
    }
    const continuousBar = bpmKnown ? barTurnsRef.current + barPhase : 0;
    // Soft amp follow so enter/exit BPM doesn't pop the flicker.
    barFlickerSmooth.current = smoothToward(
      barFlickerSmooth.current,
      bpmKnown ? barAmp * (1 - stillness * 0.4) : 0,
      dt,
      0.16,
      0.22,
    );
    const barFlickerAmp = barFlickerSmooth.current;

    const gather = gatherSmooth.current;
    const impact = impactSmooth.current;
    const kick = kickSmooth.current;
    const snare = snareSmooth.current;
    const hat = hatSmooth.current;
    const swell = swellSmooth.current;
    const afterglow = afterglowSmooth.current;

    // Lift on swell: choruses loft the ashfield; gather slows the rise.
    // motionMul suspends the column mid-air during holdBreath; tenderLiftMul
    // gentles the loft on soft vocals without stopping it.
    const lift =
      dt *
      pace *
      sectionPace *
      calm *
      motionMul *
      tenderLiftMul *
      (0.55 + swell * 1.15 + m.energy * 0.35 + m.bass * 0.2) *
      (1 - gather * 0.72);

    // Kick: brief upward punch — distinct from swell's sustained loft.
    // Kit accents stay ungated so thaw + drum hits remain intact.
    const kickLift = kick * dt * pace * calm * 2.8;
    // Snare: lateral ash shear amplitude (phase-split L/R per ember).
    const snareShear = snare * dt * pace * calm * 3.4;

    const flare = 1 + impact * 0.85 + afterglow * 0.2;
    // Coals dim: size + opacity ease down while suspended, then rekindle on thaw.
    // Tenderness softens into slightly larger, milkier glow (rosy soft coals).
    // LeanIn brightens faintly with expectation (not impact's hit flare).
    const coalDim = 1 - stillness * 0.48;
    const softGlow = 1 + tender * 0.14;
    const leanGlow = 1 + lean * 0.12;
    mat.size =
      (0.048 + swell * 0.028 + impact * 0.04 + kick * 0.018) *
      (0.92 + kitAmp * 0.08) *
      (0.72 + coalDim * 0.28) *
      softGlow *
      leanGlow;
    mat.opacity = Math.min(
      1,
      (0.58 + swell * 0.28 + impact * 0.18 + afterglow * 0.12 + lean * 0.08) *
        coalDim *
        (1 - tender * 0.06),
    );

    const posAttr = points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const colorAttr = points.geometry.getAttribute('color') as THREE.BufferAttribute;
    const colArr = colorAttr.array as Float32Array;

    const bassC = scratchBass.current.set(palette.bass);
    const midC = scratchMid.current.set(palette.mid);
    const highC = scratchHigh.current.set(palette.high);
    const warmC = scratchWarm.current.setRGB(1, 0.55, 0.22);
    const coalC = scratchCoal.current.setRGB(0.18, 0.08, 0.04);
    const rosyC = scratchRosy.current.setRGB(1.0, 0.48, 0.42);
    const mixC = scratchMix.current;
    const t = timeRef.current;

    // Inhale toward center on gather — stronger on outer embers.
    // Gather stays ungated so pre-beat inhale still reads under thaw.
    const gatherPull = 1 - gather * dt * 2.1;
    // LeanIn densify: sustained column hug (milder than gather's pulsed inhale).
    const leanDensify = 1 - lean * dt * 1.15;
    // Expectation stills lateral drift a notch — not a freeze (holdBreath owns that).
    const leanDriftMul = 1 - lean * 0.38;

    for (let i = 0; i < baseCount; i++) {
      const i3 = i * 3;
      const phase = phases[i]!;
      const band = bands[i]!;
      const sizeMul = sizes[i]!;

      let x = arr[i3] ?? 0;
      let y = arr[i3 + 1] ?? 0;
      let z = arr[i3 + 2] ?? 0;

      const wobble =
        Math.sin(t * (1.1 + phase * 1.8) + phase * 12.0) *
        (0.01 + m.mid * 0.012) *
        tenderDriftMul *
        leanDriftMul;
      const driftX = ((velocities[i3] ?? 0) + wobble) * tenderDriftMul * leanDriftMul;
      const driftZ =
        ((velocities[i3 + 2] ?? 0) + Math.cos(t * (0.9 + phase) + phase * 7.0) * 0.008) *
        tenderDriftMul *
        leanDriftMul;
      const rise = (velocities[i3 + 1] ?? 0.5) * (0.85 + sizeMul * 0.25);

      x += driftX * lift * 18;
      y += rise * lift;
      z += driftZ * lift * 18;

      // Kick upward lift punch — ash surges up the column on the kick.
      y += rise * kickLift * (0.7 + sizeMul * 0.45);
      // Snare lateral shear — phase-split L/R so the field cracks sideways.
      const lateral = (i & 1) === 0 ? 1 : -1;
      const shearSign = phase > 0.5 ? lateral : -lateral;
      x += snareShear * shearSign * (0.85 + phase * 0.4);
      z += snareShear * shearSign * 0.35 * (0.7 + phase * 0.5);

      // Soft radial inhale — ash folds toward the column, not a hard snap.
      x *= gatherPull;
      z *= gatherPull;
      // LeanIn densify — sustained axis hug, distinct from gather's beat inhale.
      x *= leanDensify;
      z *= leanDensify;
      // Vertical inhale: settle slightly toward mid-frame before the beat.
      y += (0 - y) * gather * dt * 1.05;

      // Recycle off the top (or if yanked too far) back to the hearth below.
      if (y > Y_MAX || Math.hypot(x, z) > 3.6) {
        const seed = i * 1.6180339887 + t * 0.01;
        const r = Math.sqrt(hash01(seed + 0.11)) * 2.2;
        const ang = hash01(seed + 0.37) * Math.PI * 2;
        x = Math.cos(ang) * r;
        y = Y_MIN - hash01(seed + 0.71) * 0.35;
        z = Math.sin(ang) * r * 0.85;
      }

      arr[i3] = x;
      arr[i3 + 1] = y;
      arr[i3 + 2] = z;

      const baseCol = band === 0 ? bassC : band === 1 ? midC : highC;
      const warmth = 0.42 + phase * 0.28 + afterglow * 0.35 + impact * 0.2 + kick * 0.12;
      mixC.copy(baseCol).lerp(warmC, Math.min(0.85, warmth));
      // Tenderness: milk toward rosy soft coals while the field keeps breathing.
      // Softened under stillness so holdBreath dark coals stay the freeze read.
      mixC.lerp(rosyC, tender * (1 - stillness * 0.85) * 0.58);
      // Hold-breath coals: milk the ember toward dark residual heat.
      mixC.lerp(coalC, stillness * 0.62);

      // Height gradient: cooler near the hearth, hotter as they rise.
      const heightNorm = (y - Y_MIN) / Y_SPAN;
      const heightGlow = 0.75 + heightNorm * 0.45;
      // Sparse hat ticks — only ~1/3 of embers sparkle so it reads as ticks.
      const tickSelect = hash01(phase * 17.13 + i * 0.31) > 0.62 ? 1 : 0;
      const sparkle = 1 + tickSelect * hat * (1.1 + m.shimmer * 0.4);
      // Kick warms bass embers; snare flashes mid — motion is the primary accent.
      const kitGlow =
        (band === 0 ? kick * 0.28 : kick * 0.08) + (band === 1 ? snare * 0.32 : snare * 0.1);
      // Bar-locked coal flicker — continuous height-phased wave, one breath/bar.
      // Softer and ongoing vs hat ticks / impact flare / kick band glow.
      const barPhaseWave =
        barFlickerAmp > 0.01
          ? Math.sin(heightNorm * Math.PI * 2 - continuousBar * Math.PI * 2 + phase * 0.7)
          : 0;
      const barFlicker = 1 + barPhaseWave * 0.2 * barFlickerAmp;
      // LeanIn expectation glow — faint brighten, not a hit flare.
      const leanBright = 1 + lean * 0.22;
      const gain =
        heightGlow *
        flare *
        sparkle *
        barFlicker *
        leanBright *
        (0.85 + swell * 0.25) *
        (1 + kitGlow) *
        (1 - stillness * 0.42);

      colArr[i3] = Math.min(1, mixC.r * gain);
      colArr[i3 + 1] = Math.min(1, mixC.g * gain);
      colArr[i3 + 2] = Math.min(1, mixC.b * gain);
    }

    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;

    // Phrase-echo spark train: cool blue-white motes climb through warm ash,
    // cresting spark-to-spark with the gap's rhythm, then cool and fade.
    const sparks = sparkRef.current;
    const sparkMat = sparkMatRef.current;
    if (sparks && sparkMat) {
      const sPosAttr = sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
      const sColAttr = sparks.geometry.getAttribute('color') as THREE.BufferAttribute;
      const sArr = sPosAttr.array as Float32Array;
      const sCol = sColAttr.array as Float32Array;

      const src = echoSource.current;
      const echoC = scratchEcho.current.setRGB(0.55, 0.82, 1.0);
      const travel = echoTravel.current;
      // Soft under stillness so holdBreath coals still own the hush.
      const echoPulse = echoVis * (1 - stillness * 0.55);

      sparkMat.size = (0.042 + echoPulse * 0.038) * (0.9 + kitAmp * 0.1);
      sparkMat.opacity = traveling ? Math.min(1, 0.12 + echoPulse * 0.88) : 0.02;

      for (let i = 0; i < sparkCount; i++) {
        const i3 = i * 3;
        const phase = sparkPhases[i]!;
        const slot = ((phase + i * 0.07) % 1 + 1) % 1;
        const crestDist = Math.abs(slot - travel);
        const crestWrap = Math.min(crestDist, 1 - crestDist);
        const crestEnv = traveling
          ? Math.exp(-crestWrap * crestWrap * 55) *
            (0.4 + 0.6 * Math.max(0, Math.sin(travel * Math.PI * 10 + phase * 18.0)))
          : 0;
        const pulse = echoPulse * crestEnv;

        if (!traveling || pulse < 0.004) {
          // Park offscreen when idle / before crest so draw stays cheap.
          sArr[i3] = 0;
          sArr[i3 + 1] = -40;
          sArr[i3 + 2] = 0;
          sCol[i3] = 0;
          sCol[i3 + 1] = 0;
          sCol[i3 + 2] = 0;
          continue;
        }

        // Climb the ash column from the hearth seed; stagger by slot so the
        // train retraces the gap as a rising ribbon, not a burst.
        const along = travel * (0.95 + phase * 0.4) + slot * 0.5;
        const ang =
          src.seed * Math.PI * 2 +
          phase * 5.2 +
          Math.sin(travel * 4.2 + phase * 9.0) * 0.28;
        const radius = 0.08 + along * (0.55 + src.seed * 0.35) * (0.55 + phase * 0.5);
        const climb = along * (Y_SPAN * 0.72 + phase * 0.55) + Math.sin(travel * 6.0 + phase * 12.0) * 0.1;
        const sx = src.x + Math.cos(ang) * radius;
        const sy = src.y + climb;
        const sz = src.z + Math.sin(ang) * radius * 0.88;

        sArr[i3] = sx;
        sArr[i3 + 1] = sy;
        sArr[i3 + 2] = sz;

        // Cool + fade as the train climbs — memory at a different temperature.
        const cool = 1 - travel * 0.55;
        const fade = (1 - travel * 0.68) * (0.55 + pulse * 0.9) * cool;
        sCol[i3] = Math.min(1, echoC.r * fade * (0.7 + pulse * 0.35));
        sCol[i3 + 1] = Math.min(1, echoC.g * fade * (0.78 + pulse * 0.25));
        sCol[i3 + 2] = Math.min(1, echoC.b * fade * (0.9 + pulse * 0.15));
      }

      sPosAttr.needsUpdate = true;
      sColAttr.needsUpdate = true;
    }

    // Very slow column sway — alive, never storm-spin; freezes with holdBreath,
    // gentles under tenderness so intimate passages feel held.
    points.rotation.y +=
      dt * pace * calm * motionMul * (1 - tender * 0.5) * (0.04 + m.mid * 0.03 + swell * 0.02);
    if (sparks) sparks.rotation.y = points.rotation.y;

    // LeanIn: drift the ash column nearer with mild presence scale (expectant
    // approach). Distinct from gather's per-ember radial inhale.
    const root = rootRef.current;
    if (root) {
      root.position.z = -lean * 0.55;
      root.scale.setScalar(1 + lean * 0.06);
    }

    if (analyser) analyser.getFrequencyData(freqBuf.current);
  });

  return (
    <group ref={rootRef}>
      <points ref={ref}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} count={baseCount} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} count={baseCount} />
        </bufferGeometry>
        <pointsMaterial
          ref={matRef}
          size={0.055}
          map={sprite}
          sizeAttenuation
          transparent
          vertexColors
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      <points ref={sparkRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[sparkPositions, 3]}
            count={sparkCount}
          />
          <bufferAttribute attach="attributes-color" args={[sparkColors, 3]} count={sparkCount} />
        </bufferGeometry>
        <pointsMaterial
          ref={sparkMatRef}
          size={0.045}
          map={sprite}
          sizeAttenuation
          transparent
          vertexColors
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          opacity={0.02}
        />
      </points>
    </group>
  );
}
