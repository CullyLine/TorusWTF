'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useMetricsRef } from './metrics';

/**
 * Aura — the persistent presence layer.
 *
 * Two parts, both rendered behind every preset:
 *  - wisps:    ~200 small drifting motes that wander on Perlin-like paths
 *  - soulGlow: a soft persistent radial halo that breathes with audio energy
 *
 * Musical flock (call-and-response):
 *  - gather → wisps drift inward (the inhale before the kick)
 *  - impact / release → burst outward
 *  - shimmer / hat → glitter ticks on size + opacity
 *  - kick → soul-glow core pulse + brief inward-downward wisp dip (heartbeat)
 *  - snare → brief lateral scatter flick (backbeat sideways, not radial/Z)
 *  - leanIn → mild approach toward camera/center (anticipation, pre-drop)
 *  - echo → one-shot counter-drift swirl + rhythmic glint replay in phrase gaps
 *  - afterglow → residual ember warmth on wisps + soul glow while peaks decay
 *  - convergence → shared orbital ring around the flock center; calm deliberate
 *    orbit + faint brighten while bands lock; soft dissolve as lock fades
 *  - tension → slow tightening coil around the subject; dim + sharpen as the
 *    build climbs (sustained strain, not gather inhale or lock ring)
 *  - dropEvent → one synchronized outward bloom, then ease back to free flocking
 *    (bigger than per-kick dip / impact burst; springs the coil loose)
 *
 * Stillness (holdBreath / deep silence):
 *  - Perlin drift nearly freezes
 *  - soft huddle toward the spawn center
 *  - thaw resumes promptly when music returns
 *
 * Both exist regardless of audio source. With music they brighten and
 * flock; in silence they listen, then keep drifting like dust in a beam.
 */

/**
 * Ember residue mixed into wisp/glow colors while afterglow decays.
 * Deeper than Background/Torus amber so the overlay remembers coals, not sky.
 */
const AFTERGLOW_EMBER = new THREE.Color(1.0, 0.42, 0.16);
const AFTERGLOW_WARMTH_MIX = 0.4;
/** Ease tau for color-temperature linger (fluid, not stair-stepped). */
const AFTERGLOW_WARMTH_TAU = 0.35;

interface AuraLayerProps {
  palette: { bass: string; mid: string; high: string };
  /** 0 = no aura, 1 = full presence. Default 0.4. */
  amount?: number;
  tier: 'high' | 'mid' | 'low';
}

const WISP_COUNT_HIGH = 280;
const WISP_COUNT_MID = 160;
const WISP_COUNT_LOW = 60;

/** Spawn-region center — flock inhale/burst radiates from here. */
const FLOCK_CX = 0;
const FLOCK_CY = 0;
const FLOCK_CZ = -1.5;
/** Shared orbital ring radius when bands lock into convergence. */
const LOCK_RING_R = 2.15;

function createAuraRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

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

/** Bias a color toward ember by eased afterglow; quiet (0) is a no-op. */
function applyAfterglowEmber(
  color: THREE.Color,
  warmthLinger: number,
  scratchEmber: THREE.Color,
  mix: number,
): void {
  const t = Math.max(0, Math.min(1, warmthLinger)) * mix;
  if (t < 0.001) return;
  color.lerp(scratchEmber.copy(AFTERGLOW_EMBER), t);
}

export function AuraLayer({ palette, amount = 0.4, tier }: AuraLayerProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const glowMatRef = useRef<THREE.ShaderMaterial>(null);
  const metricsRef = useMetricsRef();

  // Smoothed musical envelopes so flock motion feels fluid, not gated.
  const gatherSmooth = useRef(0);
  const burstSmooth = useRef(0);
  const glitterSmooth = useRef(0);
  // Kick heartbeat: core pulse + inward-downward dip — distinct from snare X flick.
  const kickSmooth = useRef(0);
  // Snare backbeat: brief lateral scatter — distinct from gather/lean/echo.
  const snareSmooth = useRef(0);
  // Smoothed lean-in so anticipation eases toward the viewer, not snaps.
  const leanSmooth = useRef(0);
  // Smoothed stillness so freeze/thaw never pops.
  const stillnessSmooth = useRef(0);
  // Phrase-echo one-shot: arm on quiet, fire one counter-swirl per gap.
  const echoSmooth = useRef(0);
  const echoTravel = useRef(1); // 0..1 traveling; >=1 idle
  const echoArmed = useRef(true);
  const prevEcho = useRef(0);
  const echoSign = useRef(1);
  // Convergence lock — ease wisps into one shared orbital ring when bands lock.
  const lockSmooth = useRef(0);
  // Shared orbit angle advances while locked (calm, deliberate pace).
  const lockOrbitAngle = useRef(0);
  // Tension coil — slow inward spiral + dim/sharpen through builds; springs
  // loose on dropEvent/release. Distinct from gather inhale and lock ring.
  const tensionSmooth = useRef(0);
  // Drop bloom — one synchronized outward burst bigger than kick/impact.
  const dropSmooth = useRef(0);
  // Color-temperature linger tracks afterglow (intensity path unchanged).
  const warmthLingerRef = useRef(0);

  // Reused color temps — avoid per-frame Color allocations in the glow lerp.
  const bassColor = useRef(new THREE.Color(palette.bass));
  const midColor = useRef(new THREE.Color(palette.mid));
  const scratchEmber = useRef(new THREE.Color());

  const wispCount =
    tier === 'high' ? WISP_COUNT_HIGH : tier === 'mid' ? WISP_COUNT_MID : WISP_COUNT_LOW;
  // Soften reply on mid/low so the overlay never strobes under the preset.
  const echoAmp = tier === 'high' ? 1 : tier === 'mid' ? 0.9 : 0.7;
  // Kit + ember amp: mid/low keep the kick/flick/warmth readable without fighting presets.
  const kitAmp = tier === 'high' ? 1 : tier === 'mid' ? 0.9 : 0.7;
  // Lock amp: full ring formation on high; slightly softer on mid/low.
  const lockAmp = tier === 'high' ? 1 : tier === 'mid' ? 0.9 : 0.75;
  // Tension / drop amps: full coil+bloom on high; readable without fighting presets.
  const tensionAmp = tier === 'high' ? 1 : tier === 'mid' ? 0.9 : 0.75;
  const dropAmp = tier === 'high' ? 1 : tier === 'mid' ? 0.9 : 0.7;
  const warmthMix =
    (tier === 'high' ? 1 : tier === 'mid' ? 0.9 : 0.75) * AFTERGLOW_WARMTH_MIX;

  // Per-wisp seeds for stable trajectory + per-wisp brightness phase offset.
  const { positions, seeds, colors, baseColors } = useMemo(() => {
    const pos = new Float32Array(wispCount * 3);
    const seed = new Float32Array(wispCount * 4);
    const col = new Float32Array(wispCount * 3);
    const bass = new THREE.Color(palette.bass);
    const mid = new THREE.Color(palette.mid);
    const high = new THREE.Color(palette.high);
    const random = createAuraRng(0xa17a5eed ^ wispCount);
    for (let i = 0; i < wispCount; i++) {
      // Spawn in a sphere around the camera-facing region.
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      const r = 2 + random() * 3;
      pos[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      pos[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * r;
      pos[i * 3 + 2] = Math.cos(phi) * r - 1.5;
      // Per-wisp trajectory seeds (sin frequencies for x/y/z + brightness phase).
      seed[i * 4] = 0.05 + random() * 0.12;
      seed[i * 4 + 1] = 0.05 + random() * 0.12;
      seed[i * 4 + 2] = 0.05 + random() * 0.12;
      seed[i * 4 + 3] = random() * Math.PI * 2;
      // Color: a tertiary mix biased toward mid (rare bass/high wisps).
      const pick = random();
      const c = pick < 0.2 ? bass : pick < 0.85 ? mid : high;
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    // Immutable palette snapshot so afterglow ember can lerp without drift.
    return { positions: pos, seeds: seed, colors: col, baseColors: col.slice() };
  }, [wispCount, palette.bass, palette.mid, palette.high]);

  // Soul glow shader: a soft radial gradient that breathes with audio.
  const glowUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(palette.mid) },
      uIntensity: { value: 0.0 },
      uRadius: { value: 1.0 },
    }),
    [palette.mid],
  );

  const glowVertex = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const glowFragment = /* glsl */ `
    uniform vec3 uColor;
    uniform float uIntensity;
    uniform float uRadius;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv - 0.5;
      float d = length(p) / 0.5;
      // Soft falloff, never fully transparent at center, vanishes by edge.
      float a = (1.0 - smoothstep(0.0, uRadius, d)) * uIntensity;
      gl_FragColor = vec4(uColor, a);
    }
  `;

  useFrame((state, delta) => {
    if (amount <= 0) return;
    const m = metricsRef.current;
    const now = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);

    // Fast rise on hits / gather so the inhale lands; slower fall so the
    // flock eases rather than pops back to idle wander.
    gatherSmooth.current = smoothToward(gatherSmooth.current, m.gather, dt, 0.04, 0.16);
    const burstTarget = Math.min(1.4, m.impact * 0.9 + m.release * 0.55);
    burstSmooth.current = smoothToward(burstSmooth.current, burstTarget, dt, 0.03, 0.14);
    const glitterTarget = Math.min(1.3, m.hat * 0.95 + m.shimmer * 0.55);
    glitterSmooth.current = smoothToward(glitterSmooth.current, glitterTarget, dt, 0.025, 0.11);
    // Kick rises fast (heartbeat thump), eases out — kit ungated by stillness.
    kickSmooth.current = smoothToward(
      kickSmooth.current,
      Math.min(1.2, m.kick) * kitAmp,
      dt,
      0.025,
      0.14,
    );
    // Snare rises fast (backbeat flick), eases out — kit ungated by stillness.
    snareSmooth.current = smoothToward(
      snareSmooth.current,
      Math.min(1.2, m.snare) * kitAmp,
      dt,
      0.02,
      0.12,
    );
    // Lean-in rises with tension (eager anticipation); settles slower so the
    // approach lingers into the drop rather than snapping back.
    leanSmooth.current = smoothToward(leanSmooth.current, m.leanIn, dt, 0.06, 0.18);

    // Hold-breath + deep silence → presence listens. Rise a touch slower than
    // fall so the freeze feels attentive, not gated; thaw resumes promptly.
    const stillnessTarget = Math.min(
      1,
      Math.max(m.holdBreath, m.silence * 0.92) + Math.min(m.holdBreath, m.silence) * 0.15,
    );
    stillnessSmooth.current = smoothToward(
      stillnessSmooth.current,
      stillnessTarget,
      dt,
      0.12,
      0.07,
    );

    // Phrase-echo reply: arm on quiet, fire one travel per echo rise so the
    // overlay answers once in the gap instead of strobing with sustained echo.
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
      echoSign.current *= -1;
    }
    prevEcho.current = echoNow;
    if (echoTravel.current < 1) {
      const bpm = Math.max(60, Math.min(180, m.bpm || 120));
      // BPM-paced travel — a reply swirl, not a whip.
      echoTravel.current = Math.min(1, echoTravel.current + dt * 0.88 * (0.85 + bpm / 180));
    }
    const traveling = echoTravel.current < 1;
    // Envelope peaks early, eases as travel completes — settle without snap.
    const echoVis = traveling
      ? echoSmooth.current * (1 - echoTravel.current * 0.3)
      : echoSmooth.current * 0.04;
    // Counter-swirl strength fades across the travel; sign flips each gap.
    const reverseAmt = traveling ? echoSmooth.current * (1 - echoTravel.current) : 0;
    const swirlAmt = reverseAmt * echoSign.current;
    // Drift flips against the usual wander while the reply is active.
    const driftDir = 1 - reverseAmt * 2;

    // Convergence lock: eager into the chord (~0.1s), softer release (~0.18s)
    // so the ring dissolves without a snap. Soft under stillness so the hang
    // owns quiet (lock ≠ freeze); gather/leanIn/kit/echo stay distinct.
    lockSmooth.current = smoothToward(
      lockSmooth.current,
      Math.min(1, Math.max(0, m.convergence ?? 0)) * lockAmp,
      dt,
      0.1,
      0.18,
    );

    // Tension coil: slow rise through the build (~0.4s), spring-loose on
    // drop/release (~0.12s). Soft under stillness so holdBreath still owns quiet.
    // Zero target on drop/release so the coil never fights the bloom.
    let tensionTarget = Math.min(1, Math.max(0, m.tension ?? 0)) * tensionAmp;
    if (m.dropEvent > 0.12 || m.release > 0.18) tensionTarget = 0;
    tensionSmooth.current = smoothToward(
      tensionSmooth.current,
      tensionTarget,
      dt,
      0.4,
      0.12,
    );
    if (m.dropEvent > 0.12) {
      // Hard-release the coil so the bloom reads as spring-loose, not a fade.
      tensionSmooth.current = smoothToward(tensionSmooth.current, 0, dt, 0.04, 0.04);
    }

    // Drop bloom: fast attack, inertial settle — one outward surge bigger than
    // per-kick dip / impact burst. Sibling to Tide Veil / Silk Wake drop envelopes.
    dropSmooth.current = smoothToward(
      dropSmooth.current,
      Math.min(1.35, m.dropEvent * 1.05 + m.impact * 0.2 + m.release * 0.12) * dropAmp,
      dt,
      0.03,
      0.55,
    );

    const gather = gatherSmooth.current;
    const burst = burstSmooth.current;
    const glitter = glitterSmooth.current;
    const kick = kickSmooth.current;
    const snare = snareSmooth.current;
    const lean = leanSmooth.current;
    const stillness = stillnessSmooth.current;
    const lock = lockSmooth.current * (1 - stillness * 0.3);
    const tension = tensionSmooth.current * (1 - stillness * 0.3);
    const drop = dropSmooth.current;
    // Power curve: early lock stays loose; choruses snap into one ring.
    const lockSnap = lock * lock;
    // Steadier continuous drive when locked — not frozen (holdBreath owns that).
    const lockPace = 1 - lock * 0.38;
    // Shared orbit advances calmly while locked; slows as lock fades (no snap).
    lockOrbitAngle.current += dt * (0.22 + lock * 0.48) * lockPace;
    const orbitAngle = lockOrbitAngle.current;
    // Color-temperature linger tracks afterglow — quiet verses leave wisps untinted.
    warmthLingerRef.current +=
      (m.afterglow - warmthLingerRef.current) * (1 - Math.exp(-dt / AFTERGLOW_WARMTH_TAU));
    const warmthLinger = warmthLingerRef.current;
    // Drift nearly stops at full stillness; a whisper remains so the cloud
    // never looks frozen-dead. Flock gather/burst still owns the radial axis.
    // Lock trims wander so free flocking yields to the shared ring.
    // Tension also trims wander — the coil coheres without freezing.
    const driftMul = 1 - stillness * 0.92;
    const huddle = stillness * 1.35;
    // Lean approach keeps moving through hush — anticipation ≠ listening freeze.
    // Soften only a little so lean still reads under partial stillness.
    const leanMul = 1 - stillness * 0.35;
    // Echo reply still reads under partial hush (a memory in the quiet), but
    // never fights a full holdBreath freeze.
    const echoMul = 1 - stillness * 0.55;

    // Update wisp positions (gentle Perlin-style drift + musical flock + stillness).
    const points = pointsRef.current;
    const mat = matRef.current;
    if (points && mat) {
      const posAttr = points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const colAttr = points.geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
      const colArr = colAttr ? (colAttr.array as Float32Array) : null;
      // Radial flock speed (units/sec). Gather pulls harder than burst so
      // the inhale reads clearly; burst rides impact without exploding.
      // Lean-in is a milder approach (~0.9 vs gather 2.4) so pre-drop
      // anticipation never masquerades as the gather inhale.
      // Tension adds a slow inward coil pull — weaker and sustained vs gather.
      // Drop blooms outward hard — bigger than impact burst, springs the coil.
      const flockIn = gather * 2.4 + lean * 0.9 * leanMul + tension * 1.15;
      const flockOut = burst * 3.2 + drop * 5.4;
      // Soften idle wander during the inhale so the cloud coheres; stillness
      // scales the leftover wander further. Lean trims wander lightly so the
      // cloud coheres toward the viewer without freezing like holdBreath.
      // Lock yields free flocking to the shared ring without a freeze.
      // Tension coils wander down further — strain, not freeze.
      const wanderScale =
        (1 -
          gather * 0.55 -
          lean * 0.22 * leanMul -
          lock * 0.55 -
          tension * 0.62) *
        driftMul;
      // Camera is +Z-facing; lean drifts wisps toward the viewer separately
      // from the radial gather inhale.
      const approachZ = lean * 0.85 * leanMul;
      // Tangential swirl speed (units/sec) — orthogonal to gather radial axis.
      const swirlSpeed = swirlAmt * 2.6 * echoMul;
      // Tension coil: slow shared tangential spin that tightens with the build —
      // distinct from echo's one-shot reply swirl and lock's calm ring orbit.
      const coilSpin = tension * 1.55;
      // Lateral scatter speed — world-X flick with per-wisp sign (not echo swirl).
      const snareFlick = snare * 3.4;
      // Kick dip speed — brief inward + downward thump (not snare X, not gather inhale).
      const kickDip = kick * 2.6;
      const emberMix = Math.max(0, Math.min(1, warmthLinger)) * warmthMix;
      const emberR = AFTERGLOW_EMBER.r;
      const emberG = AFTERGLOW_EMBER.g;
      const emberB = AFTERGLOW_EMBER.b;
      for (let i = 0; i < wispCount; i++) {
        const fx = seeds[i * 4]!;
        const fy = seeds[i * 4 + 1]!;
        const fz = seeds[i * 4 + 2]!;
        const i3 = i * 3;
        let x = arr[i3] ?? 0;
        let y = arr[i3 + 1] ?? 0;
        let z = arr[i3 + 2] ?? 0;

        // Drift along a wandering path. Bass slightly amplifies vertical motion
        // so the cloud "swells" subtly with the kick. Phrase-echo briefly flips
        // the wander direction — a counter-drift, not a radial flock move.
        x += Math.sin(now * fx + i * 0.13) * dt * 0.08 * wanderScale * driftDir;
        y +=
          Math.cos(now * fy + i * 0.17) * dt * 0.06 * (1 + m.bass * 0.4) * wanderScale * driftDir;
        z += Math.sin(now * fz + i * 0.21) * dt * 0.04 * wanderScale * driftDir;

        // Flock: radial pull toward / push from the spawn-region center.
        const dx = x - FLOCK_CX;
        const dy = y - FLOCK_CY;
        const dz = z - FLOCK_CZ;
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-4;
        const invR = 1 / r;
        // Slight per-wisp phase so the flock isn't a perfect sphere collapse.
        const phase = 0.85 + 0.3 * Math.sin(seeds[i * 4 + 3]! + now * 1.7);
        const radial = (flockOut - flockIn) * phase * dt;
        x += dx * invR * radial;
        y += dy * invR * radial;
        z += dz * invR * radial;

        // Phrase-echo counter-swirl: tangential orbit around the flock center.
        // Distinct from gather (radial) and leanIn (Z approach) — a sideways reply.
        if (Math.abs(swirlSpeed) > 0.01) {
          const swirlPhase = 0.8 + 0.4 * Math.sin(seeds[i * 4 + 3]! * 1.9 + i * 0.09);
          const sx = -dy * invR;
          const sy = dx * invR;
          // Mild vertical lift on the swirl so the reply reads in depth too.
          const sz = Math.sin(seeds[i * 4 + 3]! + echoTravel.current * Math.PI) * 0.35;
          x += sx * swirlSpeed * swirlPhase * dt;
          y += sy * swirlSpeed * swirlPhase * dt;
          z += sz * Math.abs(swirlSpeed) * swirlPhase * dt * 0.45;
        }

        // Tension coil spin: sustained shared tangential tighten through the
        // build — slower and steadier than echo reply, not a lock ring slot.
        if (coilSpin > 0.01) {
          const seedPhase = seeds[i * 4 + 3]!;
          const coilPhase = 0.85 + 0.3 * Math.sin(seedPhase * 1.3 + i * 0.07);
          const sx = -dy * invR;
          const sy = dx * invR;
          x += sx * coilSpin * coilPhase * dt;
          y += sy * coilSpin * coilPhase * dt;
          // Slight Z compress so the coil reads as tightening, not flattening.
          z += (FLOCK_CZ - z) * tension * coilPhase * dt * 0.35;
        }

        // Snare lateral scatter flick: world-X kick with opposing signs so the
        // cloud spatters sideways on the backbeat — not gather radial, not
        // leanIn Z, not echo tangential orbit. Kit stays ungated by hush.
        if (snareFlick > 0.01) {
          const seedPhase = seeds[i * 4 + 3]!;
          const sign = Math.sin(seedPhase * 3.7 + i * 0.31) >= 0 ? 1 : -1;
          const scatter = 0.55 + 0.45 * Math.sin(seedPhase * 2.3 + i * 0.17);
          const yKick = 0.28 * Math.sin(seedPhase * 1.4 + i * 0.23);
          x += sign * snareFlick * scatter * dt;
          y += sign * snareFlick * yKick * dt;
        }

        // Kick inward-downward dip: chest thump — brief radial tuck plus a
        // floor-bound Y drop. Vertical/radial answer to snare's lateral flick;
        // weaker and shorter than gather inhale, ungated by hush.
        if (kickDip > 0.01) {
          const seedPhase = seeds[i * 4 + 3]!;
          const dipPhase = 0.7 + 0.3 * Math.sin(seedPhase * 2.1 + i * 0.19);
          const inward = kickDip * dipPhase * dt * 0.55;
          const down = kickDip * dipPhase * dt * 1.15;
          x -= dx * invR * inward;
          y -= dy * invR * inward * 0.35 + down;
          z -= dz * invR * inward;
        }

        // Lean approach: bias toward the camera (+Z) with per-wisp phase so
        // anticipation feels like a flock leaning forward, not a Z snap.
        if (approachZ > 0.01) {
          const leanPhase = 0.8 + 0.4 * Math.sin(seeds[i * 4 + 3]! * 1.6 + i * 0.11);
          z += approachZ * leanPhase * dt;
        }

        // Huddle: gentle pull toward center while listening — attentive, not a collapse.
        // Unchanged by leanIn — listening freeze stays a different behavior.
        if (huddle > 0.01) {
          const huddlePhase = 0.75 + 0.35 * Math.sin(seeds[i * 4 + 3]! * 2.1 + i * 0.07);
          const pull = huddle * huddlePhase * dt * Math.min(1, r * 0.35);
          x -= dx * invR * pull;
          y -= dy * invR * pull;
          z -= dz * invR * pull;
        }

        // Convergence: ease onto one shared orbital ring around flock center.
        // Distinct from gather (radial inhale), huddle (listening freeze pull),
        // leanIn (Z approach), and echo (one-shot counter-swirl that flips).
        // Soft slot ease + shared tangential orbit — flocks fall into formation.
        if (lockSnap > 0.01) {
          const seedPhase = seeds[i * 4 + 3]!;
          // Preferred ring angle rides the shared orbit so the formation turns
          // as one body; soft per-wisp phase keeps it from looking mechanical.
          const slot =
            orbitAngle + seedPhase + Math.sin(seedPhase * 1.7 + i * 0.05) * 0.12;
          const ellipse = 0.72 + 0.08 * Math.sin(seedPhase * 0.9);
          const targetX = FLOCK_CX + Math.cos(slot) * LOCK_RING_R;
          const targetY = FLOCK_CY + Math.sin(slot) * LOCK_RING_R * ellipse;
          const targetZ = FLOCK_CZ + Math.sin(seedPhase * 1.3 + i * 0.03) * 0.32;
          const ease = lockSnap * dt * 1.85;
          x += (targetX - x) * ease;
          y += (targetY - y) * ease;
          z += (targetZ - z) * ease;
          // Tangential orbit once near the ring — calm, shared direction.
          // Weaker and steadier than echo's reply swirl; no sign flip.
          const ox = x - FLOCK_CX;
          const oy = y - FLOCK_CY;
          const oR = Math.sqrt(ox * ox + oy * oy) + 1e-4;
          const orbitSpeed = lock * 1.35 * lockPace;
          const oPhase = 0.85 + 0.3 * Math.sin(seedPhase * 1.4 + i * 0.08);
          x += (-oy / oR) * orbitSpeed * oPhase * dt;
          y += (ox / oR) * orbitSpeed * oPhase * dt;
        }

        // Soft attractor back toward spawn region so wisps don't escape.
        const escapeR = Math.sqrt(x * x + y * y + z * z);
        if (escapeR > 6) {
          const pull = (escapeR - 6) * dt * 0.5;
          const eInv = 1 / escapeR;
          x -= x * eInv * pull;
          y -= y * eInv * pull;
          z -= z * eInv * pull;
        }

        arr[i3] = x;
        arr[i3 + 1] = y;
        arr[i3 + 2] = z;

        // Afterglow ember: restore palette base, then bias toward coals while
        // the peak residue decays — quiet afterglow leaves colors untinted.
        if (colArr) {
          const br = baseColors[i3]!;
          const bg = baseColors[i3 + 1]!;
          const bb = baseColors[i3 + 2]!;
          if (emberMix > 0.001) {
            colArr[i3] = br + (emberR - br) * emberMix;
            colArr[i3 + 1] = bg + (emberG - bg) * emberMix;
            colArr[i3 + 2] = bb + (emberB - bb) * emberMix;
          } else {
            colArr[i3] = br;
            colArr[i3 + 1] = bg;
            colArr[i3 + 2] = bb;
          }
        }
      }
      posAttr.needsUpdate = true;
      if (colAttr) colAttr.needsUpdate = true;

      // Wisp brightness: high-band wash + sharp hat/shimmer glitter ticks.
      // Stillness softens the live pulse so listening feels quieter.
      // Lean slightly brightens — presence leans closer into the light.
      // Phrase-echo replays glints on a BPM-ish pulse that fades with travel.
      // Convergence faintly brightens as the ring locks — cohesion, not a hit.
      // Tension dims + sharpens (smaller size); drop blooms size/opacity once.
      const livePulse = 1 - stillness * 0.55;
      const phaseTwinkle = glitter > 0.08 ? 0.5 + 0.5 * Math.sin(now * 28 + glitter * 9) : 0;
      const bpm = Math.max(60, Math.min(180, m.bpm || 120));
      const echoGlint =
        echoVis * echoMul > 0.04
          ? 0.5 +
            0.5 *
              Math.sin(
                now * ((bpm / 60) * Math.PI * 2) * 2 +
                  echoTravel.current * Math.PI * 4 +
                  echoSign.current,
              )
          : 0;
      mat.size =
        (0.04 +
          m.high * 0.1 * livePulse +
          glitter * 0.09 * (0.55 + phaseTwinkle * 0.9) +
          lean * 0.025 * leanMul +
          echoVis * echoMul * 0.07 * (0.45 + echoGlint * 0.9) +
          lock * 0.028 +
          drop * 0.055 -
          tension * 0.022) *
        (0.7 + amount * 0.3);
      mat.opacity = Math.min(
        1,
        (0.25 +
          (m.high * 0.4 + m.flow * 0.12) * livePulse +
          glitter * 0.45 +
          gather * 0.08 +
          lean * 0.06 * leanMul +
          echoVis * echoMul * 0.32 * (0.5 + echoGlint * 0.7) +
          lock * 0.1 +
          drop * 0.28 -
          tension * 0.14) *
          amount,
      );
    }

    // Soul glow breathes with energy + a slow autonomous pulse (the heartbeat
    // is also handled in SceneRig as camera breath; here it just keeps glow alive).
    const glowMat = glowMatRef.current;
    const glowMesh = glowRef.current;
    if (glowMat) {
      const autoBreath = 0.18 + 0.06 * Math.sin(now * 0.4) * (1 - stillness * 0.7);
      // Tenderness expands the glow softly; silence quiets it; drops punch through.
      const tenderExpand = 1 + m.tenderness * 0.7;
      const silenceMute = 1 - m.silence * 0.6;
      // Inhale dims slightly; burst + glitter lift intensity with the flock.
      // Kick punches the soul-glow core — the heartbeat thump (not snare/hat).
      // Lean adds a soft presence lift (anticipation), weaker than burst.
      // Echo lifts the halo briefly during the reply, then eases with travel.
      // Lock faintly brightens the halo as the ring forms — cohesion, not a hit.
      // Tension dims the halo (coil darkens); drop blooms it once — spring-loose.
      glowMat.uniforms.uIntensity!.value =
        (autoBreath +
          m.bass * 0.5 +
          m.beat * 0.3 +
          m.release * 0.5 +
          kick * 0.42 +
          burst * 0.22 +
          glitter * 0.18 +
          lean * 0.1 * leanMul +
          echoVis * echoMul * 0.14 +
          lock * 0.09 +
          drop * 0.38 -
          gather * 0.12 -
          tension * 0.22) *
        amount *
        silenceMute *
        tenderExpand;
      // Warm vs cool target color depends on moodValence and tenderness.
      // Phrase-echo cools a touch so the reply reads as after-image, not a hit.
      const warmth =
        0.5 + m.moodValence * 0.35 + m.tenderness * 0.2 - echoVis * echoMul * 0.18;
      bassColor.current.set(palette.bass);
      midColor.current.set(palette.mid);
      const glowColor = glowMat.uniforms.uColor!.value as THREE.Color;
      glowColor.lerpColors(
        bassColor.current,
        midColor.current,
        Math.max(0, Math.min(1, warmth)),
      );
      // Peak residue: ember coals on the halo while afterglow decays — distinct
      // from echo cool and from tenderness soft expand.
      applyAfterglowEmber(glowColor, warmthLinger, scratchEmber.current, warmthMix);
      // Soft radius inhale / release so the halo flocks with the wisps.
      // Kick briefly opens the core (chest swell) then rides the kick envelope out.
      // Stillness tucks the halo in slightly while listening.
      // Lean gently enlarges toward the viewer — presence approaches.
      // Tension tightens the halo; drop blooms it outward once.
      glowMat.uniforms.uRadius!.value =
        1 -
        gather * 0.12 +
        burst * 0.08 +
        kick * 0.07 -
        stillness * 0.1 +
        lean * 0.05 * leanMul +
        echoVis * echoMul * 0.04 -
        tension * 0.1 +
        drop * 0.14;
      if (glowMesh) {
        const s =
          1 -
          gather * 0.06 +
          burst * 0.05 +
          kick * 0.045 -
          stillness * 0.04 +
          lean * 0.035 * leanMul +
          echoVis * echoMul * 0.025 -
          tension * 0.055 +
          drop * 0.08;
        glowMesh.scale.setScalar(s);
      }
    }
  });

  if (amount <= 0) return null;

  return (
    <>
      {/* Soul glow: large fullscreen-ish plane positioned behind everything. */}
      <mesh ref={glowRef} position={[0, 0, -3]}>
        <planeGeometry args={[12, 12]} />
        <shaderMaterial
          ref={glowMatRef}
          vertexShader={glowVertex}
          fragmentShader={glowFragment}
          uniforms={glowUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Wisp particle cloud. */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
            count={wispCount}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[colors, 3]}
            count={wispCount}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          ref={matRef}
          size={0.06}
          sizeAttenuation
          transparent
          opacity={0.3}
          vertexColors
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* Suppress unused-seed warning by referencing it as a comment uniform. */}
      {/* (seeds array is used inside useFrame above; this fragment is intentionally empty.) */}
    </>
  );
}
