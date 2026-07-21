import { describe, expect, it } from 'vitest';
import { DEFAULT_METRICS } from '../metrics';
import {
  createBubblePool,
  emitBubbleBurst,
  emitBubbleParticles,
  resetBubblePool,
  stepBubblePool,
} from './bubbleSimulation';
import { DEFAULT_BUBBLE_EMITTER_SETTINGS } from './settings';
import type { EmitterContinuousSettings } from './types';

const BASE_SETTINGS: EmitterContinuousSettings = {
  rate: DEFAULT_BUBBLE_EMITTER_SETTINGS.rate,
  size: DEFAULT_BUBBLE_EMITTER_SETTINGS.size,
  lifetime: DEFAULT_BUBBLE_EMITTER_SETTINGS.lifetime,
  lift: DEFAULT_BUBBLE_EMITTER_SETTINGS.lift,
  spread: DEFAULT_BUBBLE_EMITTER_SETTINGS.spread,
  turbulence: DEFAULT_BUBBLE_EMITTER_SETTINGS.turbulence,
  opacity: DEFAULT_BUBBLE_EMITTER_SETTINGS.opacity,
};

function snapshot(pool: ReturnType<typeof createBubblePool>) {
  return {
    positions: Array.from(pool.positions),
    velocities: Array.from(pool.velocities),
    ages: Array.from(pool.ages),
    lifetimes: Array.from(pool.lifetimes),
    seeds: Array.from(pool.seeds),
    sizes: Array.from(pool.sizes),
    active: Array.from(pool.active),
    rngState: pool.rngState,
    activeCount: pool.activeCount,
    nextIndex: pool.nextIndex,
    emittedTotal: pool.emittedTotal,
  };
}

describe('bubble pool determinism', () => {
  it('initializes and advances identically from the same seed', () => {
    const config = { capacity: 12, burstLimit: 5, seed: 0x1234abcd };
    const first = createBubblePool(config);
    const second = createBubblePool(config);
    const different = createBubblePool({ ...config, seed: config.seed + 1 });

    expect(snapshot(first)).toEqual(snapshot(second));
    expect(Array.from(first.seeds)).not.toEqual(Array.from(different.seeds));

    emitBubbleParticles(first, 5, BASE_SETTINGS);
    emitBubbleParticles(second, 5, BASE_SETTINGS);
    stepBubblePool(first, 1 / 60, BASE_SETTINGS, DEFAULT_METRICS);
    stepBubblePool(second, 1 / 60, BASE_SETTINGS, DEFAULT_METRICS);
    expect(snapshot(first)).toEqual(snapshot(second));

    resetBubblePool(first, config.seed);
    expect(snapshot(first)).toEqual(snapshot(createBubblePool(config)));
  });
});

describe('bubble lifecycle', () => {
  it('emits continuously, expires particles, and reuses the fixed pool', () => {
    const pool = createBubblePool({ capacity: 6, burstLimit: 3, seed: 42 });
    const settings: EmitterContinuousSettings = {
      ...BASE_SETTINGS,
      rate: 10,
      lifetime: 1,
      lift: 0,
      spread: 0,
      turbulence: 0,
    };

    expect(stepBubblePool(pool, 0.1, settings, DEFAULT_METRICS)).toBe(1);
    expect(stepBubblePool(pool, 0.1, settings, DEFAULT_METRICS)).toBe(1);
    expect(pool.activeCount).toBe(2);

    settings.rate = 0;
    for (let step = 0; step < 13; step++) {
      stepBubblePool(pool, 0.1, settings, DEFAULT_METRICS);
    }

    expect(pool.activeCount).toBe(0);
    expect(Array.from(pool.active)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(Array.from(pool.ages)).toEqual([-1, -1, -1, -1, -1, -1]);
    expect(pool.positions.length).toBe(18);
    expect(pool.velocities.length).toBe(18);

    expect(emitBubbleParticles(pool, 6, settings)).toBe(6);
    expect(pool.activeCount).toBe(6);
  });
});

describe('bubble bursts', () => {
  it('clamps strength, tier burst size, and remaining capacity', () => {
    const pool = createBubblePool({ capacity: 10, burstLimit: 4, seed: 7 });

    expect(emitBubbleBurst(pool, -1, BASE_SETTINGS)).toBe(0);
    expect(emitBubbleBurst(pool, Number.NaN, BASE_SETTINGS)).toBe(0);
    expect(emitBubbleBurst(pool, 0.5, BASE_SETTINGS)).toBe(2);
    expect(emitBubbleBurst(pool, 999, BASE_SETTINGS)).toBe(4);
    expect(emitBubbleBurst(pool, 1, BASE_SETTINGS)).toBe(4);
    expect(emitBubbleBurst(pool, 1, BASE_SETTINGS)).toBe(0);

    expect(pool.activeCount).toBe(pool.capacity);
    expect(pool.emittedTotal).toBe(pool.capacity);
  });
});
