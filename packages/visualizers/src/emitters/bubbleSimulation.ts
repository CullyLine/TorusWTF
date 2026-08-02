import {
  DEFAULT_FLOW_PARAMS,
  flowParamsFromMetrics,
  sampleFlow,
  type FlowParams,
  type Vec3Like,
} from '../dsp/flowfield';
import type { AudioMetrics } from '../metrics';
import type { EmitterContinuousSettings } from './types';

const UINT32_RANGE = 4294967296;
const TAU = Math.PI * 2;
const MAX_POOL_CAPACITY = 65536;
const MAX_WORLD_Y = 5.5;
const MAX_WORLD_RADIUS_SQUARED = 72;
const MAX_RATE = 120;
const MAX_LIFETIME = 20;
const MAX_LIFT = 3;
const MAX_SPREAD = 3;
const MAX_TURBULENCE = 2;

/** Large frame gaps are intentionally not replayed as a burst of catch-up work. */
export const MAX_BUBBLE_STEP_SECONDS = 0.1;

/** Soft kit amp when the caller does not pass a tier scale (tests, headless). */
const DEFAULT_KIT_AMP = 1;
/** Soft echo amp when the caller does not pass a tier scale (tests, headless). */
const DEFAULT_ECHO_AMP = 1;
/** Phrase-echo train: pulses spaced along BPM-paced travel (no pile-up). */
const ECHO_TRAIN_SLOTS = 5;
/** Bubbles emitted per echo pulse — small bright glints, not a kick surge. */
const ECHO_PULSE_COUNT = 3;

export interface BubblePoolConfig {
  capacity: number;
  seed: number;
  burstLimit: number;
}

/**
 * Smoothed drum / macro envelopes kept on the pool so stepBubblePool stays
 * allocation-free and deterministic across identical metric streams.
 */
export interface BubbleKitState {
  kickSmooth: number;
  prevKick: number;
  snareSmooth: number;
  prevSnare: number;
  /** Alternating ±1 lateral flick direction; flips on each snare rising edge. */
  snareDir: number;
  hatSmooth: number;
  gatherSmooth: number;
  stillnessSmooth: number;
  tenderSmooth: number;
  echoSmooth: number;
  prevEcho: number;
  /** 1 while waiting for the next phrase gap; 0 once a train has fired. */
  echoArmed: number;
  /** 0..1 traveling crest; >=1 idle. */
  echoTravel: number;
  /** How many of the ECHO_TRAIN_SLOTS pulses have been emitted this travel. */
  echoEmitCursor: number;
}

/**
 * Struct-of-arrays particle pool. Every array is allocated once and is safe
 * to bind directly to THREE.BufferAttributes.
 */
export interface BubblePool {
  readonly capacity: number;
  readonly burstLimit: number;
  readonly positions: Float32Array;
  readonly velocities: Float32Array;
  readonly ages: Float32Array;
  readonly lifetimes: Float32Array;
  readonly seeds: Float32Array;
  readonly sizes: Float32Array;
  readonly active: Uint8Array;
  /** 1 = phrase-echo glint bubble (cool silver, smaller); 0 = normal film. */
  readonly echoFlags: Uint8Array;
  seed: number;
  rngState: number;
  activeCount: number;
  nextIndex: number;
  emissionCarry: number;
  emittedTotal: number;
  spawnRevision: number;
  flowTime: number;
  /** Last-frame hat envelope for the shader (young-bubble micro-pop glints). */
  hatGlint: number;
  /** Last-frame tenderness envelope for milkier rise / softer glints. */
  tenderSoft: number;
  /** Last-frame phrase-echo envelope for cool silver catch-lights. */
  echoGlint: number;
  readonly kit: BubbleKitState;
  readonly flowParams: FlowParams;
  readonly flowOptions: { turbulence: number; vortex: number };
  readonly flowScratch: Vec3Like;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Asymmetric SmoothDamp-style ease — fast attack, slower release. */
function smoothToward(
  current: number,
  target: number,
  dt: number,
  riseTau: number,
  fallTau: number,
): number {
  const tau = target > current ? riseTau : fallTau;
  return current + (target - current) * (1 - Math.exp(-dt / Math.max(1e-4, tau)));
}

/** holdBreath + deep silence → mid-water listen (same blend as Aura / presets). */
function stillnessFromMetrics(holdBreath: number, silence: number): number {
  return Math.min(
    1,
    Math.max(holdBreath, silence * 0.92) + Math.min(holdBreath, silence) * 0.15,
  );
}

function normalizeCapacity(value: number): number {
  return Math.floor(clamp(finiteOr(value, 1), 1, MAX_POOL_CAPACITY));
}

function normalizeSeed(value: number): number {
  return Math.trunc(finiteOr(value, 0)) >>> 0;
}

/** Stateful Mulberry32 step; deterministic in every JS runtime used by exports. */
function nextRandom(pool: BubblePool): number {
  pool.rngState = (pool.rngState + 0x6d2b79f5) >>> 0;
  let value = pool.rngState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
}

export function createBubblePool(config: BubblePoolConfig): BubblePool {
  const capacity = normalizeCapacity(config.capacity);
  const pool: BubblePool = {
    capacity,
    burstLimit: Math.floor(clamp(finiteOr(config.burstLimit, 1), 1, capacity)),
    positions: new Float32Array(capacity * 3),
    velocities: new Float32Array(capacity * 3),
    ages: new Float32Array(capacity),
    lifetimes: new Float32Array(capacity),
    seeds: new Float32Array(capacity),
    sizes: new Float32Array(capacity),
    active: new Uint8Array(capacity),
    echoFlags: new Uint8Array(capacity),
    seed: 0,
    rngState: 0,
    activeCount: 0,
    nextIndex: 0,
    emissionCarry: 0,
    emittedTotal: 0,
    spawnRevision: 0,
    flowTime: 0,
    hatGlint: 0,
    tenderSoft: 0,
    echoGlint: 0,
    kit: {
      kickSmooth: 0,
      prevKick: 0,
      snareSmooth: 0,
      prevSnare: 0,
      snareDir: 1,
      hatSmooth: 0,
      gatherSmooth: 0,
      stillnessSmooth: 0,
      tenderSmooth: 0,
      echoSmooth: 0,
      prevEcho: 0,
      echoArmed: 1,
      echoTravel: 1,
      echoEmitCursor: 0,
    },
    flowParams: { ...DEFAULT_FLOW_PARAMS },
    flowOptions: { turbulence: 0, vortex: 0 },
    flowScratch: { x: 0, y: 0, z: 0 },
  };
  resetBubblePool(pool, config.seed);
  return pool;
}

/** Clear and deterministically reseed an existing pool without reallocating it. */
export function resetBubblePool(pool: BubblePool, seed = pool.seed): void {
  pool.seed = normalizeSeed(seed);
  pool.rngState = pool.seed;
  pool.activeCount = 0;
  pool.nextIndex = 0;
  pool.emissionCarry = 0;
  pool.emittedTotal = 0;
  pool.spawnRevision++;
  pool.flowTime = 0;
  pool.hatGlint = 0;
  pool.tenderSoft = 0;
  pool.echoGlint = 0;
  pool.kit.kickSmooth = 0;
  pool.kit.prevKick = 0;
  pool.kit.snareSmooth = 0;
  pool.kit.prevSnare = 0;
  pool.kit.snareDir = 1;
  pool.kit.hatSmooth = 0;
  pool.kit.gatherSmooth = 0;
  pool.kit.stillnessSmooth = 0;
  pool.kit.tenderSmooth = 0;
  pool.kit.echoSmooth = 0;
  pool.kit.prevEcho = 0;
  pool.kit.echoArmed = 1;
  pool.kit.echoTravel = 1;
  pool.kit.echoEmitCursor = 0;
  pool.positions.fill(0);
  pool.velocities.fill(0);
  pool.ages.fill(-1);
  pool.lifetimes.fill(0);
  pool.active.fill(0);
  pool.echoFlags.fill(0);

  for (let index = 0; index < pool.capacity; index++) {
    pool.seeds[index] = nextRandom(pool);
    pool.sizes[index] = 0.68 + nextRandom(pool) * 0.68;
  }

  Object.assign(pool.flowParams, DEFAULT_FLOW_PARAMS);
  pool.flowParams.seed = (pool.seed % 65521) * 0.001;
}

function deactivateBubble(pool: BubblePool, index: number): void {
  if (pool.active[index] !== 1) return;
  pool.active[index] = 0;
  pool.activeCount--;
  pool.ages[index] = -1;
  pool.lifetimes[index] = 0;
  pool.echoFlags[index] = 0;
  const i3 = index * 3;
  pool.positions[i3] = 0;
  pool.positions[i3 + 1] = 0;
  pool.positions[i3 + 2] = 0;
  pool.velocities[i3] = 0;
  pool.velocities[i3 + 1] = 0;
  pool.velocities[i3 + 2] = 0;
}

function findInactiveIndex(pool: BubblePool): number {
  if (pool.activeCount >= pool.capacity) return -1;
  for (let checked = 0; checked < pool.capacity; checked++) {
    const index = (pool.nextIndex + checked) % pool.capacity;
    if (pool.active[index] === 0) {
      pool.nextIndex = (index + 1) % pool.capacity;
      return index;
    }
  }
  return -1;
}

function activateBubble(
  pool: BubblePool,
  index: number,
  settings: EmitterContinuousSettings,
  echo = false,
): void {
  const spread = clamp(finiteOr(settings.spread, 1), 0, MAX_SPREAD);
  const lift = clamp(finiteOr(settings.lift, 1), 0, MAX_LIFT);
  const meanLifetime = clamp(finiteOr(settings.lifetime, 8), 0.01, MAX_LIFETIME);

  // Echo glints: tighter base spawn, smaller size, shorter life, brisker climb.
  const echoSpread = echo ? spread * 0.42 : spread;
  const angle = nextRandom(pool) * TAU;
  const radius = Math.sqrt(nextRandom(pool)) * echoSpread * (echo ? 0.95 : 1.75);
  const lateralSpeed = echoSpread * (0.025 + nextRandom(pool) * (echo ? 0.06 : 0.1));
  const i3 = index * 3;

  pool.positions[i3] = Math.cos(angle) * radius;
  pool.positions[i3 + 1] = -2.65 - nextRandom(pool) * (echo ? 0.35 : 0.65);
  pool.positions[i3 + 2] = Math.sin(angle) * radius * 0.72;
  pool.velocities[i3] =
    Math.cos(angle) * lateralSpeed + (nextRandom(pool) - 0.5) * echoSpread * 0.055;
  pool.velocities[i3 + 1] = lift * (echo ? 0.52 + nextRandom(pool) * 0.22 : 0.38 + nextRandom(pool) * 0.28);
  pool.velocities[i3 + 2] =
    Math.sin(angle) * lateralSpeed * 0.72 + (nextRandom(pool) - 0.5) * echoSpread * 0.04;
  pool.ages[index] = 0;
  pool.lifetimes[index] = echo
    ? meanLifetime * (0.42 + nextRandom(pool) * 0.28)
    : meanLifetime * (0.75 + nextRandom(pool) * 0.5);
  // Always rewrite size so echo glints don't permanently shrink recycled slots.
  pool.sizes[index] = echo
    ? 0.32 + nextRandom(pool) * 0.28
    : 0.68 + nextRandom(pool) * 0.68;
  pool.echoFlags[index] = echo ? 1 : 0;
  pool.active[index] = 1;
  pool.activeCount++;
  pool.emittedTotal++;
  pool.spawnRevision++;
}

/**
 * Activate at most `requested` currently-free particles. Work is bounded by
 * pool capacity even when an untrusted trigger supplies a huge number.
 */
export function emitBubbleParticles(
  pool: BubblePool,
  requested: number,
  settings: EmitterContinuousSettings,
  echo = false,
): number {
  if (!Number.isFinite(requested) || requested <= 0) return 0;
  const count = Math.min(pool.capacity - pool.activeCount, pool.capacity, Math.floor(requested));
  let emitted = 0;
  while (emitted < count) {
    const index = findInactiveIndex(pool);
    if (index < 0) break;
    activateBubble(pool, index, settings, echo);
    emitted++;
  }
  return emitted;
}

/**
 * Strength is normalized to 0..1 and maps to the tier-specific burst limit.
 * Returns the actual count, which can be smaller only when the pool is full.
 */
export function emitBubbleBurst(
  pool: BubblePool,
  strength: number,
  settings: EmitterContinuousSettings,
): number {
  if (!Number.isFinite(strength) || strength <= 0) return 0;
  const requested = Math.ceil(pool.burstLimit * Math.min(1, strength));
  return emitBubbleParticles(pool, requested, settings);
}

/**
 * Advance lifecycle, buoyancy, and the shared curl-flow current, then perform
 * continuous rate emission. The pool and all scratch data are mutated in
 * place; the numeric return value is the continuous count emitted this step
 * (kick burst particles are counted separately via `emittedTotal`).
 *
 * Kit / macro accents (supporting texture — never fireworks):
 * - `kick` → buoyant upward surge + small `emitBubbleBurst`
 * - `snare` → brief lateral current flick that shears the column sideways
 * - `hat` → smoothed glint envelope (`pool.hatGlint` for the shader)
 * - `gather` → gentle inward pull toward the column core
 * - `tenderness` → slower milkier rise with softer glints (`pool.tenderSoft`)
 * - `holdBreath` / deep silence → mid-water suspension that thaws on return
 * - `echo` → one-shot BPM-paced train of small cool glint-bubbles from the base
 *
 * Existing breath / flow / shimmer drift and manual burst impulses are unchanged.
 *
 * `kitAmp` (0..1) softens accents on mid/low tiers; defaults to 1.
 * `echoAmp` (0..1) softens the phrase-echo train on mid/low; defaults to 1.
 */
export function stepBubblePool(
  pool: BubblePool,
  deltaSeconds: number,
  settings: EmitterContinuousSettings,
  metrics: AudioMetrics,
  kitAmp = DEFAULT_KIT_AMP,
  echoAmp = DEFAULT_ECHO_AMP,
): number {
  const dt = clamp(finiteOr(deltaSeconds, 0), 0, MAX_BUBBLE_STEP_SECONDS);
  if (dt <= 0) return 0;

  const amp = clamp(finiteOr(kitAmp, DEFAULT_KIT_AMP), 0, 1);
  const eAmp = clamp(finiteOr(echoAmp, DEFAULT_ECHO_AMP), 0, 1);
  const turbulence = clamp(finiteOr(settings.turbulence, 0), 0, MAX_TURBULENCE);
  const lift = clamp(finiteOr(settings.lift, 1), 0, MAX_LIFT);
  const flowLevel = clamp(finiteOr(metrics.flow, 0), 0, 2);
  const shimmer = clamp(finiteOr(metrics.shimmer, 0), 0, 2);
  const breath = clamp(finiteOr(metrics.breath, 0), 0, 2);

  const kit = pool.kit;
  kit.kickSmooth = smoothToward(
    kit.kickSmooth,
    Math.min(1.2, Math.max(0, metrics.kick)) * amp,
    dt,
    0.045,
    0.14,
  );
  kit.snareSmooth = smoothToward(
    kit.snareSmooth,
    Math.min(1.2, Math.max(0, metrics.snare)) * amp,
    dt,
    0.04,
    0.12,
  );
  kit.hatSmooth = smoothToward(
    kit.hatSmooth,
    Math.min(1.2, Math.max(0, metrics.hat) * 0.95 + shimmer * 0.2) * amp,
    dt,
    0.03,
    0.1,
  );
  kit.gatherSmooth = smoothToward(
    kit.gatherSmooth,
    Math.min(1, Math.max(0, metrics.gather)),
    dt,
    0.05,
    0.16,
  );
  kit.stillnessSmooth = smoothToward(
    kit.stillnessSmooth,
    stillnessFromMetrics(
      Math.min(1, Math.max(0, metrics.holdBreath)),
      Math.min(1, Math.max(0, metrics.silence)),
    ),
    dt,
    0.14,
    0.08,
  );
  kit.tenderSmooth = smoothToward(
    kit.tenderSmooth,
    Math.min(1, Math.max(0, metrics.tenderness)),
    dt,
    0.12,
    0.22,
  );
  kit.echoSmooth = smoothToward(
    kit.echoSmooth,
    Math.min(1, Math.max(0, metrics.echo)) * eAmp,
    dt,
    0.05,
    0.32,
  );

  const kick = kit.kickSmooth;
  const snare = kit.snareSmooth;
  const gather = kit.gatherSmooth;
  const stillness = kit.stillnessSmooth;
  const tender = kit.tenderSmooth;
  const echoNow = kit.echoSmooth;
  // Soft under hush so thaw still breathes; never a hard freeze-dead.
  // Tenderness slows without freezing — distinct from holdBreath suspension.
  const motionMul = (1 - stillness * 0.9) * (1 - tender * 0.28);
  const ageMul = 1 - stillness * 0.85;
  // Soften hat micro-pops under tenderness — milkier, not sparkly.
  pool.hatGlint = kit.hatSmooth * (1 - tender * 0.7);
  pool.tenderSoft = tender;

  // Phrase-echo: arm on quiet, fire one BPM-paced glint train per gap.
  if (echoNow < 0.08) kit.echoArmed = 1;
  if (kit.echoArmed === 1 && echoNow > 0.22 && kit.prevEcho <= 0.22) {
    kit.echoTravel = 0;
    kit.echoArmed = 0;
    kit.echoEmitCursor = 0;
  }
  kit.prevEcho = echoNow;
  if (kit.echoTravel < 1) {
    const bpm = metrics.bpm && metrics.bpm > 30 ? metrics.bpm : 120;
    const echoPace = 0.9 + amp * 0.15;
    kit.echoTravel = Math.min(1, kit.echoTravel + dt * echoPace * (0.85 + bpm / 180));
  }
  const traveling = kit.echoTravel < 1;
  // Soft under stillness so holdBreath still owns the hush.
  const echoVis = traveling
    ? echoNow * (1 - kit.echoTravel * 0.3) * (1 - stillness * 0.55)
    : echoNow * 0.04 * (1 - stillness * 0.55);
  pool.echoGlint = echoVis;

  // Emit crest-by-slot pulses while the train climbs — spaced to the gap's BPM.
  if (traveling && echoVis > 0.02) {
    const slot = Math.min(
      ECHO_TRAIN_SLOTS - 1,
      Math.floor(kit.echoTravel * ECHO_TRAIN_SLOTS),
    );
    while (kit.echoEmitCursor <= slot && kit.echoEmitCursor < ECHO_TRAIN_SLOTS) {
      const pulseStrength = 0.55 + (1 - kit.echoEmitCursor / ECHO_TRAIN_SLOTS) * 0.35;
      const count = Math.max(
        1,
        Math.round(ECHO_PULSE_COUNT * pulseStrength * (0.75 + eAmp * 0.25)),
      );
      emitBubbleParticles(pool, count, settings, true);
      kit.echoEmitCursor++;
    }
  }

  // Kick buoyant surge burst — rising-edge only, capped so it stays a texture.
  const kickRise = kick - kit.prevKick;
  if (kickRise > 0.07 && kick > 0.28) {
    const burstStrength = Math.min(0.28, kick * 0.2 + kickRise * 0.35);
    emitBubbleBurst(pool, burstStrength, settings);
  }
  kit.prevKick = kick;

  // Snare lateral flick — rising-edge flips direction; soft under hush.
  const snareRise = snare - kit.prevSnare;
  const snareHit = snareRise > 0.07 && snare > 0.28 && stillness < 0.55;
  if (snareHit) {
    kit.snareDir = -kit.snareDir;
  }
  kit.prevSnare = snare;
  const snareDir = kit.snareDir;
  // Soft under hush so a quiet bar does not keep shearing the column.
  const snareAmp = snare * (1 - stillness * 0.85) * (1 - tender * 0.35);

  pool.flowTime += dt * (0.45 + flowLevel * 0.35) * (0.22 + motionMul * 0.78);
  pool.flowOptions.turbulence = turbulence * 0.5;
  const flowParams = flowParamsFromMetrics(metrics, pool.flowParams, pool.flowOptions);
  flowParams.time = pool.flowTime;
  flowParams.seed = (pool.seed % 65521) * 0.001;

  const flowAcceleration =
    turbulence * (0.05 + flowLevel * 0.045 + shimmer * 0.02) * (1 - tender * 0.4);
  // Tenderness: slower, milkier rise — damp buoyancy without freezing.
  const liftAcceleration = lift * (0.018 + breath * 0.012) * (1 - tender * 0.48);
  // Kick: brief upward buoyant pulse — accents, not a rocket.
  const kickLiftAccel = kick * lift * 0.55;
  // Snare: brief lateral current across the column (X primary, slight Z).
  const snareLateralAccel = snareAmp * (1.35 + amp * 0.45);
  // Gather: pull toward the column core (XZ → 0), distinct from kick Y surge.
  const gatherPull = gather * (1.55 + amp * 0.55) * (1 - stillness * 0.35);
  const damping = Math.exp(
    -dt *
      (0.055 + turbulence * 0.025 + stillness * 3.6 + gather * 0.06 + tender * 0.35),
  );
  const flow = pool.flowScratch;
  const integrateDt = dt * motionMul;

  for (let index = 0; index < pool.capacity; index++) {
    if (pool.active[index] !== 1) continue;

    const age = pool.ages[index]! + dt * ageMul;
    if (age >= pool.lifetimes[index]!) {
      deactivateBubble(pool, index);
      continue;
    }
    pool.ages[index] = age;

    const i3 = index * 3;
    const x = pool.positions[i3]!;
    const y = pool.positions[i3 + 1]!;
    const z = pool.positions[i3 + 2]!;
    sampleFlow(flow, x, y, z, index % 3, flowParams);

    let vx = (pool.velocities[i3]! + flow.x * flowAcceleration * integrateDt) * damping;
    let vy =
      (pool.velocities[i3 + 1]! +
        (liftAcceleration + kickLiftAccel + flow.y * flowAcceleration * 0.55) * integrateDt) *
      damping;
    let vz = (pool.velocities[i3 + 2]! + flow.z * flowAcceleration * integrateDt) * damping;

    // Gentle inward gather — radial XZ only, leaves vertical buoyancy alone.
    if (gatherPull > 0.001) {
      vx -= x * gatherPull * integrateDt;
      vz -= z * gatherPull * integrateDt;
    }

    // Snare lateral current — shears the whole column sideways (not a Y surge).
    if (snareLateralAccel > 0.001) {
      vx += snareDir * snareLateralAccel * integrateDt;
      vz += snareDir * snareLateralAccel * 0.38 * integrateDt;
    }

    // Rising-edge kick impulse: a one-frame buoyant pop on the hit.
    if (kickRise > 0.07 && kick > 0.28) {
      vy += kickRise * lift * 0.42;
    }

    // Rising-edge snare impulse: a one-frame lateral flick on the hit.
    if (snareHit) {
      vx += snareDir * snareRise * (0.55 + amp * 0.25);
      vz += snareDir * snareRise * 0.22;
    }

    const nextX = x + vx * integrateDt;
    const nextY = y + vy * integrateDt;
    const nextZ = z + vz * integrateDt;

    if (
      nextY > MAX_WORLD_Y ||
      nextX * nextX + nextY * nextY + nextZ * nextZ > MAX_WORLD_RADIUS_SQUARED
    ) {
      deactivateBubble(pool, index);
      continue;
    }

    pool.velocities[i3] = vx;
    pool.velocities[i3 + 1] = vy;
    pool.velocities[i3 + 2] = vz;
    pool.positions[i3] = nextX;
    pool.positions[i3 + 1] = nextY;
    pool.positions[i3 + 2] = nextZ;
  }

  const rate =
    clamp(finiteOr(settings.rate, 0), 0, MAX_RATE) *
    (1 - stillness * 0.88) *
    (1 - tender * 0.22);
  pool.emissionCarry = Math.min(pool.capacity, pool.emissionCarry + rate * dt);
  const requested = Math.floor(pool.emissionCarry);
  if (requested <= 0) return 0;

  pool.emissionCarry -= requested;
  const emitted = emitBubbleParticles(pool, requested, settings);
  // A full pool should not accumulate a delayed wall of particles.
  if (emitted < requested) pool.emissionCarry = 0;
  return emitted;
}
