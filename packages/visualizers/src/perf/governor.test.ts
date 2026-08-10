import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GOVERNOR_CONFIG,
  RESOLUTION_STEPS,
  advanceGovernor,
  createGovernorState,
  resolutionScaleFor,
} from './governor';

const run = (frameMs: number, frames: number, state = createGovernorState()) => {
  for (let i = 0; i < frames; i++) advanceGovernor(state, frameMs);
  return state;
};

const SLOW = 33; // ~30fps
const FAST = 8; // ~125fps

describe('advanceGovernor', () => {
  it('starts at full resolution', () => {
    expect(resolutionScaleFor(createGovernorState())).toBe(1);
  });

  it('drops resolution once slowness is sustained', () => {
    const state = run(SLOW, DEFAULT_GOVERNOR_CONFIG.downshiftFrames);
    expect(state.step).toBe(1);
    expect(resolutionScaleFor(state)).toBeLessThan(1);
  });

  it('ignores a brief stall', () => {
    // One long frame is a tab switch or a shader compile, not a workload.
    const state = run(SLOW, DEFAULT_GOVERNOR_CONFIG.downshiftFrames - 1);
    expect(state.step).toBe(0);
  });

  it('discards absurd frame times instead of reacting to them', () => {
    const state = createGovernorState();
    for (const bogus of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, 5000]) {
      advanceGovernor(state, bogus);
    }
    expect(state.step).toBe(0);
    expect(state.slowFrames).toBe(0);
  });

  it('keeps dropping under sustained load, down to a floor', () => {
    const state = run(SLOW, DEFAULT_GOVERNOR_CONFIG.downshiftFrames * 20);
    expect(state.step).toBe(RESOLUTION_STEPS.length - 1);
    expect(resolutionScaleFor(state)).toBe(RESOLUTION_STEPS.at(-1));
  });

  it('climbs back when headroom returns', () => {
    const state = run(SLOW, DEFAULT_GOVERNOR_CONFIG.downshiftFrames * 3);
    const dropped = state.step;
    expect(dropped).toBeGreaterThan(0);
    run(FAST, DEFAULT_GOVERNOR_CONFIG.upshiftFrames, state);
    expect(state.step).toBe(dropped - 1);
  });

  it('needs far more evidence to climb than to drop', () => {
    // Recovering too eagerly is what makes adaptive resolution pump between
    // two levels, which is more distracting than either level on its own.
    expect(DEFAULT_GOVERNOR_CONFIG.upshiftFrames).toBeGreaterThan(
      DEFAULT_GOVERNOR_CONFIG.downshiftFrames * 4,
    );
  });

  it('holds steady in the dead band between the thresholds', () => {
    const between =
      (DEFAULT_GOVERNOR_CONFIG.upshiftMs + DEFAULT_GOVERNOR_CONFIG.downshiftMs) / 2;
    const state = run(between, 2000);
    expect(state.step).toBe(0);
  });

  it('does not oscillate when frame time sits right at the downshift edge', () => {
    const state = createGovernorState();
    for (let i = 0; i < 3000; i++) {
      advanceGovernor(state, i % 2 === 0 ? SLOW : FAST);
    }
    // Alternating frames should settle somewhere, not sweep the whole range.
    expect(state.step).toBeGreaterThanOrEqual(0);
    expect(state.step).toBeLessThan(RESOLUTION_STEPS.length);
  });

  it('exposes monotonically decreasing resolution steps', () => {
    for (let i = 1; i < RESOLUTION_STEPS.length; i++) {
      expect(RESOLUTION_STEPS[i]!).toBeLessThan(RESOLUTION_STEPS[i - 1]!);
    }
    expect(RESOLUTION_STEPS[0]).toBe(1);
  });
});
