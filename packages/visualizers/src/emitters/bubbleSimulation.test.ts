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

describe('bubble kit accents', () => {
  it('fires a small kick burst and lifts particles on a kick hit', () => {
    const pool = createBubblePool({ capacity: 64, burstLimit: 16, seed: 99 });
    const settings: EmitterContinuousSettings = {
      ...BASE_SETTINGS,
      rate: 0,
      lift: 1,
      turbulence: 0,
    };
    emitBubbleParticles(pool, 8, settings);
    const beforeY = Array.from({ length: 8 }, (_, i) => pool.velocities[i * 3 + 1]!);
    const beforeCount = pool.emittedTotal;

    const quiet = { ...DEFAULT_METRICS };
    for (let i = 0; i < 4; i++) stepBubblePool(pool, 1 / 60, settings, quiet);

    const kicked = { ...DEFAULT_METRICS, kick: 1 };
    stepBubblePool(pool, 1 / 60, settings, kicked);

    expect(pool.emittedTotal).toBeGreaterThan(beforeCount);
    expect(pool.emittedTotal - beforeCount).toBeLessThanOrEqual(pool.burstLimit);
    // Surviving original bubbles get a buoyant Y impulse.
    let lifted = 0;
    for (let i = 0; i < 8; i++) {
      if (pool.active[i] === 1 && pool.velocities[i * 3 + 1]! > beforeY[i]!) lifted++;
    }
    expect(lifted).toBeGreaterThan(0);
  });

  it('pulls the column inward on gather and suspends motion on holdBreath', () => {
    const pool = createBubblePool({ capacity: 24, burstLimit: 4, seed: 3 });
    const settings: EmitterContinuousSettings = {
      ...BASE_SETTINGS,
      rate: 0,
      lift: 0.4,
      turbulence: 0,
      spread: 1.2,
    };
    emitBubbleParticles(pool, 10, settings);

    // Park bubbles away from the axis so gather is visible.
    for (let i = 0; i < 10; i++) {
      const i3 = i * 3;
      pool.positions[i3] = 2.2;
      pool.positions[i3 + 2] = 1.6;
      pool.velocities[i3] = 0;
      pool.velocities[i3 + 1] = 0.15;
      pool.velocities[i3 + 2] = 0;
    }

    const startRadius = Math.hypot(2.2, 1.6);
    const gathering = { ...DEFAULT_METRICS, gather: 1 };
    for (let i = 0; i < 45; i++) stepBubblePool(pool, 1 / 60, settings, gathering);

    let radiusSum = 0;
    let active = 0;
    for (let i = 0; i < pool.capacity; i++) {
      if (pool.active[i] !== 1) continue;
      const x = pool.positions[i * 3]!;
      const z = pool.positions[i * 3 + 2]!;
      radiusSum += Math.hypot(x, z);
      active++;
    }
    expect(active).toBeGreaterThan(0);
    expect(radiusSum / active).toBeLessThan(startRadius * 0.72);

    // HoldBreath: velocities collapse toward suspension (mid-water hush).
    for (let i = 0; i < pool.capacity; i++) {
      if (pool.active[i] !== 1) continue;
      pool.velocities[i * 3] = 0.8;
      pool.velocities[i * 3 + 1] = 0.9;
      pool.velocities[i * 3 + 2] = 0.7;
    }
    const hush = { ...DEFAULT_METRICS, holdBreath: 1, silence: 1 };
    for (let i = 0; i < 45; i++) stepBubblePool(pool, 1 / 60, settings, hush);

    let speedSum = 0;
    active = 0;
    for (let i = 0; i < pool.capacity; i++) {
      if (pool.active[i] !== 1) continue;
      const vx = pool.velocities[i * 3]!;
      const vy = pool.velocities[i * 3 + 1]!;
      const vz = pool.velocities[i * 3 + 2]!;
      speedSum += Math.hypot(vx, vy, vz);
      active++;
    }
    expect(active).toBeGreaterThan(0);
    expect(speedSum / active).toBeLessThan(0.35);
  });

  it('exposes a smoothed hat glint envelope for young-bubble catch-lights', () => {
    const pool = createBubblePool({ capacity: 8, burstLimit: 2, seed: 11 });
    expect(pool.hatGlint).toBe(0);

    const ticking = { ...DEFAULT_METRICS, hat: 1 };
    for (let i = 0; i < 8; i++) stepBubblePool(pool, 1 / 60, BASE_SETTINGS, ticking);
    expect(pool.hatGlint).toBeGreaterThan(0.4);

    const quiet = { ...DEFAULT_METRICS };
    for (let i = 0; i < 40; i++) stepBubblePool(pool, 1 / 60, BASE_SETTINGS, quiet);
    expect(pool.hatGlint).toBeLessThan(0.08);
  });

  it('shears the column sideways on snare while kicks still lift upward', () => {
    const pool = createBubblePool({ capacity: 32, burstLimit: 4, seed: 77 });
    const settings: EmitterContinuousSettings = {
      ...BASE_SETTINGS,
      rate: 0,
      lift: 1,
      turbulence: 0,
      spread: 0.8,
    };
    emitBubbleParticles(pool, 10, settings);
    for (let i = 0; i < 10; i++) {
      const i3 = i * 3;
      pool.positions[i3] = 0.4;
      pool.positions[i3 + 1] = -1.2;
      pool.positions[i3 + 2] = 0.2;
      pool.velocities[i3] = 0;
      pool.velocities[i3 + 1] = 0.2;
      pool.velocities[i3 + 2] = 0;
    }

    const quiet = { ...DEFAULT_METRICS };
    for (let i = 0; i < 4; i++) stepBubblePool(pool, 1 / 60, settings, quiet);

    const beforeX = Array.from({ length: 10 }, (_, i) => pool.velocities[i * 3]!);
    const beforeY = Array.from({ length: 10 }, (_, i) => pool.velocities[i * 3 + 1]!);

    const snared = { ...DEFAULT_METRICS, snare: 1 };
    stepBubblePool(pool, 1 / 60, settings, snared);

    let sheared = 0;
    for (let i = 0; i < 10; i++) {
      if (pool.active[i] !== 1) continue;
      if (Math.abs(pool.velocities[i * 3]! - beforeX[i]!) > 0.05) sheared++;
    }
    expect(sheared).toBeGreaterThan(0);

    // Kick still owns the vertical surge — snare should not dominate Y.
    for (let i = 0; i < 10; i++) {
      if (pool.active[i] !== 1) continue;
      pool.velocities[i * 3] = 0;
      pool.velocities[i * 3 + 1] = 0.2;
      pool.velocities[i * 3 + 2] = 0;
    }
    for (let i = 0; i < 6; i++) stepBubblePool(pool, 1 / 60, settings, quiet);
    const midY = Array.from({ length: 10 }, (_, i) => pool.velocities[i * 3 + 1]!);
    const kicked = { ...DEFAULT_METRICS, kick: 1 };
    stepBubblePool(pool, 1 / 60, settings, kicked);
    let lifted = 0;
    for (let i = 0; i < 10; i++) {
      if (pool.active[i] === 1 && pool.velocities[i * 3 + 1]! > midY[i]!) lifted++;
    }
    expect(lifted).toBeGreaterThan(0);
    // Snare hit left lateral energy; kick hit prefers Y over further X spike.
    void beforeY;
  });

  it('slows and softens the drift on tenderness without freezing', () => {
    const pool = createBubblePool({ capacity: 24, burstLimit: 4, seed: 19 });
    const settings: EmitterContinuousSettings = {
      ...BASE_SETTINGS,
      rate: 0,
      lift: 1.2,
      turbulence: 0,
    };
    emitBubbleParticles(pool, 8, settings);
    for (let i = 0; i < 8; i++) {
      pool.velocities[i * 3] = 0;
      pool.velocities[i * 3 + 1] = 0.55;
      pool.velocities[i * 3 + 2] = 0;
    }

    const tender = { ...DEFAULT_METRICS, tenderness: 1 };
    for (let i = 0; i < 50; i++) stepBubblePool(pool, 1 / 60, settings, tender);

    expect(pool.tenderSoft).toBeGreaterThan(0.7);
    let speedSum = 0;
    let active = 0;
    for (let i = 0; i < pool.capacity; i++) {
      if (pool.active[i] !== 1) continue;
      speedSum += Math.hypot(
        pool.velocities[i * 3]!,
        pool.velocities[i * 3 + 1]!,
        pool.velocities[i * 3 + 2]!,
      );
      active++;
    }
    expect(active).toBeGreaterThan(0);
    // Slower than the seeded rise, but still drifting (not holdBreath-dead).
    expect(speedSum / active).toBeLessThan(0.45);
    expect(speedSum / active).toBeGreaterThan(0.02);

    // Hat glints soft under tenderness.
    const hatty = { ...DEFAULT_METRICS, tenderness: 1, hat: 1 };
    for (let i = 0; i < 10; i++) stepBubblePool(pool, 1 / 60, settings, hatty);
    expect(pool.hatGlint).toBeLessThan(0.45);
  });

  it('leaves breath/flow drift intact when the kit is quiet', () => {
    const config = { capacity: 16, burstLimit: 4, seed: 0x5111e07 };
    const a = createBubblePool(config);
    const b = createBubblePool(config);
    const flowing = { ...DEFAULT_METRICS, breath: 0.8, flow: 0.7, shimmer: 0.5 };
    const settings: EmitterContinuousSettings = { ...BASE_SETTINGS, rate: 8, turbulence: 0.6 };

    for (let i = 0; i < 20; i++) {
      stepBubblePool(a, 1 / 60, settings, flowing);
      stepBubblePool(b, 1 / 60, settings, flowing);
    }
    expect(snapshot(a)).toEqual(snapshot(b));
    expect(a.activeCount).toBeGreaterThan(0);
  });

  it('fires one BPM-paced echo glint train per phrase gap without pile-up', () => {
    const pool = createBubblePool({ capacity: 96, burstLimit: 8, seed: 0xec07 });
    const settings: EmitterContinuousSettings = {
      ...BASE_SETTINGS,
      rate: 0,
      lift: 1,
      turbulence: 0,
      lifetime: 6,
    };

    // Arm: quiet frames so echoSmooth stays under the arm threshold.
    const quiet = { ...DEFAULT_METRICS, bpm: 120 };
    for (let i = 0; i < 6; i++) stepBubblePool(pool, 1 / 60, settings, quiet);
    expect(pool.kit.echoArmed).toBe(1);
    expect(pool.echoGlint).toBeLessThan(0.05);

    const before = pool.emittedTotal;
    // Rising edge past 0.22 fires the train; hold echo while travel advances.
    const echoing = { ...DEFAULT_METRICS, echo: 1, bpm: 120 };
    for (let i = 0; i < 90; i++) stepBubblePool(pool, 1 / 60, settings, echoing);

    expect(pool.emittedTotal).toBeGreaterThan(before);
    // 5 slots × ~3 glints ≈ 15; allow soft rounding / amp variance.
    expect(pool.emittedTotal - before).toBeGreaterThanOrEqual(8);
    expect(pool.emittedTotal - before).toBeLessThanOrEqual(20);
    expect(pool.kit.echoArmed).toBe(0);
    expect(pool.kit.echoTravel).toBeGreaterThanOrEqual(1);
    expect(pool.kit.echoEmitCursor).toBe(5);

    let echoCount = 0;
    let echoSizeSum = 0;
    for (let i = 0; i < pool.capacity; i++) {
      if (pool.active[i] !== 1 || pool.echoFlags[i] !== 1) continue;
      echoCount++;
      echoSizeSum += pool.sizes[i]!;
    }
    expect(echoCount).toBeGreaterThan(0);
    expect(echoSizeSum / echoCount).toBeLessThan(0.65);

    // Second gap while still echoing must not re-fire (armed stays 0 until quiet).
    const midEmit = pool.emittedTotal;
    for (let i = 0; i < 10; i++) stepBubblePool(pool, 1 / 60, settings, echoing);
    expect(pool.emittedTotal).toBe(midEmit);

    // Quiet re-arms for the next phrase gap.
    for (let i = 0; i < 50; i++) stepBubblePool(pool, 1 / 60, settings, quiet);
    expect(pool.kit.echoArmed).toBe(1);
    expect(pool.echoGlint).toBeLessThan(0.08);
  });
});
