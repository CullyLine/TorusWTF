import { describe, expect, it } from 'vitest';
import {
  HIGHLIGHT_GUARD_KNEE,
  HIGHLIGHT_GUARD_THRESHOLD,
  MAX_BLOOM_INTENSITY,
  MAX_FLASH_LIGHT_BOOST,
  MAX_REACTIVE_LIGHT_INTENSITY,
  calculateBoundedBloomIntensity,
  calculateFlashLightBoost,
  clampLightSignal,
  clampReactiveLightIntensity,
  compressHighlightRgb,
} from './brightness';

describe('calculateBoundedBloomIntensity', () => {
  it('keeps the previous response through ordinary musical levels', () => {
    expect(
      calculateBoundedBloomIntensity({
        baseIntensity: 0.9,
        breath: 0.8,
        gather: 0.2,
        hit: 0.4,
        bloomPulse: 0,
        flash: 0,
      }),
    ).toBeCloseTo(0.828, 6);
  });

  it('caps extreme continuous and trigger contributions', () => {
    expect(
      calculateBoundedBloomIntensity({
        baseIntensity: Number.POSITIVE_INFINITY,
        breath: Number.POSITIVE_INFINITY,
        gather: Number.POSITIVE_INFINITY,
        hit: Number.POSITIVE_INFINITY,
        bloomPulse: Number.POSITIVE_INFINITY,
        flash: Number.POSITIVE_INFINITY,
      }),
    ).toBe(MAX_BLOOM_INTENSITY);
  });

  it('bounds each repeated trigger independently', () => {
    const response = (bloomPulse: number, flash: number) =>
      calculateBoundedBloomIntensity({
        baseIntensity: 1,
        breath: 0.5,
        gather: 0,
        hit: 0,
        bloomPulse,
        flash,
      });

    expect(response(100, 100)).toBeCloseTo(response(1, 1), 8);
  });
});

describe('reactive light limits', () => {
  it('bounds individual signals, flash boosts, and final light intensity', () => {
    expect(clampLightSignal(100)).toBe(1.25);
    expect(calculateFlashLightBoost(100)).toBe(MAX_FLASH_LIGHT_BOOST);
    expect(clampReactiveLightIntensity(100)).toBe(MAX_REACTIVE_LIGHT_INTENSITY);
    expect(clampReactiveLightIntensity(Number.NaN)).toBe(0);
  });
});

describe('compressHighlightRgb', () => {
  it('leaves ordinary colors unchanged', () => {
    expect(compressHighlightRgb([0.2, 0.5, 0.8])).toEqual([0.2, 0.5, 0.8]);
  });

  it('preserves hue ratios while keeping highlights below the display ceiling', () => {
    const compressed = compressHighlightRgb([4, 2, 1]);
    expect(Math.max(...compressed)).toBeLessThan(HIGHLIGHT_GUARD_THRESHOLD + HIGHLIGHT_GUARD_KNEE);
    expect(compressed[0] / compressed[1]).toBeCloseTo(2, 8);
    expect(compressed[1] / compressed[2]).toBeCloseTo(2, 8);
  });

  it('returns finite output for invalid channel values', () => {
    const compressed = compressHighlightRgb([Number.POSITIVE_INFINITY, Number.NaN, 0.5]);
    expect(compressed.every(Number.isFinite)).toBe(true);
  });
});
