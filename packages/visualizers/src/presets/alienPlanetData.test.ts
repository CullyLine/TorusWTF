import { describe, expect, it } from 'vitest';
import {
  ALIEN_PLANET_TIER_BUDGETS,
  budgetsAreValid,
  classifyCanopyBand,
  getAlienPlanetBudgets,
  mapCanopySampleToPaletteColor,
  paletteColorForBand,
  type AlienPlanetBudgets,
  type AlienPlanetPalette,
  type AlienPlanetTier,
} from './alienPlanetData';

const NIGHT_PALETTE: AlienPlanetPalette = {
  bass: '#1b1035',
  mid: '#7c5cff',
  high: '#ffd166',
};

const JUNGLE_PALETTE: AlienPlanetPalette = {
  bass: '#12240f',
  mid: '#3f8f3a',
  high: '#f2f7c8',
};

describe('alien planet tier budgets', () => {
  it('never increases any budget when stepping down a tier', () => {
    const high = getAlienPlanetBudgets('high');
    const mid = getAlienPlanetBudgets('mid');
    const low = getAlienPlanetBudgets('low');
    const keys = Object.keys(high) as Array<keyof AlienPlanetBudgets>;
    for (const key of keys) {
      expect(high[key]).toBeGreaterThanOrEqual(mid[key]);
      expect(mid[key]).toBeGreaterThanOrEqual(low[key]);
    }
  });

  it('keeps the full concept alive on low tier (shadow march is the only casualty)', () => {
    const low = getAlienPlanetBudgets('low');
    expect(low.traceSteps).toBeGreaterThan(0);
    expect(low.refineSteps).toBeGreaterThan(0);
    expect(low.hillOctaves).toBeGreaterThan(0);
    expect(low.detailOctaves).toBeGreaterThan(0);
    expect(low.mistSamples).toBeGreaterThan(0);
    expect(low.cloudOctaves).toBeGreaterThan(0);
    expect(low.shadowSteps).toBeGreaterThanOrEqual(0);
  });

  it('exposes the frozen tier table through the getter', () => {
    expect(getAlienPlanetBudgets('high')).toEqual(ALIEN_PLANET_TIER_BUDGETS.high);
    expect(getAlienPlanetBudgets('mid')).toEqual(ALIEN_PLANET_TIER_BUDGETS.mid);
    expect(getAlienPlanetBudgets('low')).toEqual(ALIEN_PLANET_TIER_BUDGETS.low);
    expect(getAlienPlanetBudgets('nope' as AlienPlanetTier)).toEqual(ALIEN_PLANET_TIER_BUDGETS.mid);
  });

  it('keeps every tier inside the design envelope', () => {
    for (const tier of ['high', 'mid', 'low'] as const) {
      expect(budgetsAreValid(getAlienPlanetBudgets(tier))).toBe(true);
    }
  });
});

describe('alien planet palette band mapping', () => {
  it('maps sun glints to the high color regardless of cover', () => {
    const sample = { canopyCover: 0.9, glintStrength: 0.8, shadeDepth: 0.1 };
    expect(classifyCanopyBand(sample)).toBe('glint');
    expect(mapCanopySampleToPaletteColor(sample, NIGHT_PALETTE)).toBe(NIGHT_PALETTE.high);
    expect(mapCanopySampleToPaletteColor(sample, JUNGLE_PALETTE)).toBe(JUNGLE_PALETTE.high);
  });

  it('maps bare terrain and deep shade to the bass color', () => {
    const bare = { canopyCover: 0.1, glintStrength: 0.05, shadeDepth: 0.2 };
    const shaded = { canopyCover: 0.85, glintStrength: 0.1, shadeDepth: 0.95 };
    expect(classifyCanopyBand(bare)).toBe('ground');
    expect(classifyCanopyBand(shaded)).toBe('ground');
    expect(mapCanopySampleToPaletteColor(bare, NIGHT_PALETTE)).toBe(NIGHT_PALETTE.bass);
    expect(mapCanopySampleToPaletteColor(shaded, JUNGLE_PALETTE)).toBe(JUNGLE_PALETTE.bass);
  });

  it('maps lit canopy body to the mid color', () => {
    const sample = { canopyCover: 0.75, glintStrength: 0.2, shadeDepth: 0.35 };
    expect(classifyCanopyBand(sample)).toBe('canopy');
    expect(mapCanopySampleToPaletteColor(sample, NIGHT_PALETTE)).toBe(NIGHT_PALETTE.mid);
    expect(mapCanopySampleToPaletteColor(sample, JUNGLE_PALETTE)).toBe(JUNGLE_PALETTE.mid);
  });

  it('treats non-finite sample metrics as zero instead of crashing', () => {
    const sample = {
      canopyCover: Number.NaN,
      glintStrength: Number.POSITIVE_INFINITY,
      shadeDepth: Number.NEGATIVE_INFINITY,
    };
    // Non-finite metrics all collapse to 0 → safe ground band; never throws.
    expect(classifyCanopyBand(sample)).toBe('ground');
    expect(paletteColorForBand('canopy', NIGHT_PALETTE)).toBe(NIGHT_PALETTE.mid);
  });
});
