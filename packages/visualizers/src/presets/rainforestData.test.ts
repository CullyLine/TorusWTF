import { describe, expect, it } from 'vitest';
import {
  RAINFOREST_ORIGINAL_BUDGETS,
  RAINFOREST_TIER_CONFIGS,
  bufferSizeFor,
  getRainforestPortConfig,
  portConfigIsValid,
  type RainforestPortConfig,
  type RainforestTier,
} from './rainforestData';

describe('rainforest port tier configs', () => {
  it('keeps the original shipped march budgets on the high tier', () => {
    const high = getRainforestPortConfig('high');
    expect(high.bufferScale).toBe(1);
    expect(high.cloudSteps).toBe(RAINFOREST_ORIGINAL_BUDGETS.cloudSteps);
    expect(high.terrainSteps).toBe(RAINFOREST_ORIGINAL_BUDGETS.terrainSteps);
    expect(high.treeSteps).toBe(RAINFOREST_ORIGINAL_BUDGETS.treeSteps);
    expect(high.terrainShadowSteps).toBe(RAINFOREST_ORIGINAL_BUDGETS.terrainShadowSteps);
    expect(high.treeShadowSteps).toBe(RAINFOREST_ORIGINAL_BUDGETS.treeShadowSteps);
  });

  it('never increases any budget when stepping down a tier', () => {
    const high = getRainforestPortConfig('high');
    const mid = getRainforestPortConfig('mid');
    const low = getRainforestPortConfig('low');
    const keys = Object.keys(high) as Array<keyof RainforestPortConfig>;
    for (const key of keys) {
      expect(high[key]).toBeGreaterThanOrEqual(mid[key]);
      expect(mid[key]).toBeGreaterThanOrEqual(low[key]);
    }
  });

  it('keeps every tier inside the design envelope', () => {
    for (const tier of ['high', 'mid', 'low'] as const) {
      expect(portConfigIsValid(getRainforestPortConfig(tier))).toBe(true);
    }
  });

  it('exposes the frozen tier table through the getter with a mid fallback', () => {
    expect(getRainforestPortConfig('high')).toEqual(RAINFOREST_TIER_CONFIGS.high);
    expect(getRainforestPortConfig('mid')).toEqual(RAINFOREST_TIER_CONFIGS.mid);
    expect(getRainforestPortConfig('low')).toEqual(RAINFOREST_TIER_CONFIGS.low);
    expect(getRainforestPortConfig('nope' as RainforestTier)).toEqual(RAINFOREST_TIER_CONFIGS.mid);
  });
});

describe('bufferSizeFor', () => {
  it('scales the drawing buffer by the tier fraction and rounds', () => {
    const mid = getRainforestPortConfig('mid');
    expect(bufferSizeFor(1920, 1080, mid)).toEqual({
      width: Math.round(1920 * mid.bufferScale),
      height: Math.round(1080 * mid.bufferScale),
    });
  });

  it('never returns a dimension below 8 pixels', () => {
    const low = getRainforestPortConfig('low');
    expect(bufferSizeFor(0, 0, low)).toEqual({ width: 8, height: 8 });
    expect(bufferSizeFor(4, 2, low)).toEqual({ width: 8, height: 8 });
  });

  it('treats non-finite dimensions as minimal instead of crashing', () => {
    const high = getRainforestPortConfig('high');
    expect(bufferSizeFor(Number.NaN, Number.POSITIVE_INFINITY, high).width).toBe(8);
  });
});
