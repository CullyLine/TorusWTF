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

export interface BubblePoolConfig {
  capacity: number;
  seed: number;
  burstLimit: number;
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
  seed: number;
  rngState: number;
  activeCount: number;
  nextIndex: number;
  emissionCarry: number;
  emittedTotal: number;
  spawnRevision: number;
  flowTime: number;
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
    seed: 0,
    rngState: 0,
    activeCount: 0,
    nextIndex: 0,
    emissionCarry: 0,
    emittedTotal: 0,
    spawnRevision: 0,
    flowTime: 0,
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
  pool.positions.fill(0);
  pool.velocities.fill(0);
  pool.ages.fill(-1);
  pool.lifetimes.fill(0);
  pool.active.fill(0);

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
): void {
  const spread = clamp(finiteOr(settings.spread, 1), 0, MAX_SPREAD);
  const lift = clamp(finiteOr(settings.lift, 1), 0, MAX_LIFT);
  const meanLifetime = clamp(finiteOr(settings.lifetime, 8), 0.01, MAX_LIFETIME);

  const angle = nextRandom(pool) * TAU;
  const radius = Math.sqrt(nextRandom(pool)) * spread * 1.75;
  const lateralSpeed = spread * (0.025 + nextRandom(pool) * 0.1);
  const i3 = index * 3;

  pool.positions[i3] = Math.cos(angle) * radius;
  pool.positions[i3 + 1] = -2.65 - nextRandom(pool) * 0.65;
  pool.positions[i3 + 2] = Math.sin(angle) * radius * 0.72;
  pool.velocities[i3] = Math.cos(angle) * lateralSpeed + (nextRandom(pool) - 0.5) * spread * 0.055;
  pool.velocities[i3 + 1] = lift * (0.38 + nextRandom(pool) * 0.28);
  pool.velocities[i3 + 2] =
    Math.sin(angle) * lateralSpeed * 0.72 + (nextRandom(pool) - 0.5) * spread * 0.04;
  pool.ages[index] = 0;
  pool.lifetimes[index] = meanLifetime * (0.75 + nextRandom(pool) * 0.5);
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
): number {
  if (!Number.isFinite(requested) || requested <= 0) return 0;
  const count = Math.min(pool.capacity - pool.activeCount, pool.capacity, Math.floor(requested));
  let emitted = 0;
  while (emitted < count) {
    const index = findInactiveIndex(pool);
    if (index < 0) break;
    activateBubble(pool, index, settings);
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
 * place; the numeric return value is the continuous count emitted this step.
 */
export function stepBubblePool(
  pool: BubblePool,
  deltaSeconds: number,
  settings: EmitterContinuousSettings,
  metrics: AudioMetrics,
): number {
  const dt = clamp(finiteOr(deltaSeconds, 0), 0, MAX_BUBBLE_STEP_SECONDS);
  if (dt <= 0) return 0;

  const turbulence = clamp(finiteOr(settings.turbulence, 0), 0, MAX_TURBULENCE);
  const lift = clamp(finiteOr(settings.lift, 1), 0, MAX_LIFT);
  const flowLevel = clamp(finiteOr(metrics.flow, 0), 0, 2);
  const shimmer = clamp(finiteOr(metrics.shimmer, 0), 0, 2);
  const breath = clamp(finiteOr(metrics.breath, 0), 0, 2);

  pool.flowTime += dt * (0.45 + flowLevel * 0.35);
  pool.flowOptions.turbulence = turbulence * 0.5;
  const flowParams = flowParamsFromMetrics(metrics, pool.flowParams, pool.flowOptions);
  flowParams.time = pool.flowTime;
  flowParams.seed = (pool.seed % 65521) * 0.001;

  const flowAcceleration = turbulence * (0.05 + flowLevel * 0.045 + shimmer * 0.02);
  const liftAcceleration = lift * (0.018 + breath * 0.012);
  const damping = Math.exp(-dt * (0.055 + turbulence * 0.025));
  const flow = pool.flowScratch;

  for (let index = 0; index < pool.capacity; index++) {
    if (pool.active[index] !== 1) continue;

    const age = pool.ages[index]! + dt;
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

    const vx = (pool.velocities[i3]! + flow.x * flowAcceleration * dt) * damping;
    const vy =
      (pool.velocities[i3 + 1]! + (liftAcceleration + flow.y * flowAcceleration * 0.55) * dt) *
      damping;
    const vz = (pool.velocities[i3 + 2]! + flow.z * flowAcceleration * dt) * damping;
    const nextX = x + vx * dt;
    const nextY = y + vy * dt;
    const nextZ = z + vz * dt;

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

  const rate = clamp(finiteOr(settings.rate, 0), 0, MAX_RATE);
  pool.emissionCarry = Math.min(pool.capacity, pool.emissionCarry + rate * dt);
  const requested = Math.floor(pool.emissionCarry);
  if (requested <= 0) return 0;

  pool.emissionCarry -= requested;
  const emitted = emitBubbleParticles(pool, requested, settings);
  // A full pool should not accumulate a delayed wall of particles.
  if (emitted < requested) pool.emissionCarry = 0;
  return emitted;
}
