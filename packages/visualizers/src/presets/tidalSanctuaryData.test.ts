import { describe, expect, it } from 'vitest';
import {
  TIDAL_TIER_BUDGETS,
  budgetsAreValid,
  classifyWaterBand,
  getTidalBudgets,
  mapWaterSampleToPaletteColor,
  paletteColorForBand,
  type TidalBudgets,
  type TidalPalette,
} from './tidalSanctuaryData';

const OCEAN: TidalPalette = {
  bass: '#0A2A4A',
  mid: '#1E6B8A',
  high: '#A8E6F0',
};

const SUNSET: TidalPalette = {
  bass: '#2A1030',
  mid: '#C45C26',
  high: '#FFD08A',
};

describe('tidal sanctuary tier budgets', () => {
  it('keeps high ≥ mid ≥ low for every budget field (monotonic caps)', () => {
    const high = getTidalBudgets('high');
    const mid = getTidalBudgets('mid');
    const low = getTidalBudgets('low');
    const keys = Object.keys(high) as Array<keyof TidalBudgets>;
    for (const key of keys) {
      expect(high[key]).toBeGreaterThanOrEqual(mid[key]);
      expect(mid[key]).toBeGreaterThanOrEqual(low[key]);
      expect(low[key]).toBeGreaterThan(0);
    }
    // Low tier must retain a complete ocean — not a flat empty plane.
    expect(low.traceSteps).toBeGreaterThanOrEqual(16);
    expect(low.refineSteps).toBeGreaterThanOrEqual(3);
    expect(low.waveOctaves).toBeGreaterThanOrEqual(3);
    expect(budgetsAreValid(low)).toBe(true);
    expect(budgetsAreValid(mid)).toBe(true);
    expect(budgetsAreValid(high)).toBe(true);
  });

  it('exposes frozen shared budget table matching getters', () => {
    expect(getTidalBudgets('high')).toEqual(TIDAL_TIER_BUDGETS.high);
    expect(getTidalBudgets('mid')).toEqual(TIDAL_TIER_BUDGETS.mid);
    expect(getTidalBudgets('low')).toEqual(TIDAL_TIER_BUDGETS.low);
  });
});

describe('tidal sanctuary palette-band mapping', () => {
  it('maps deep water / troughs to palette.bass', () => {
    expect(classifyWaterBand({ depthFactor: 0.85, foamAmount: 0.05, crestStrength: 0.02 })).toBe(
      'deep',
    );
    expect(
      mapWaterSampleToPaletteColor(
        { depthFactor: 0.9, foamAmount: 0.04, crestStrength: 0 },
        OCEAN,
      ),
    ).toBe(OCEAN.bass);
    expect(
      mapWaterSampleToPaletteColor(
        { depthFactor: 0.75, foamAmount: 0.1, crestStrength: 0.05 },
        SUNSET,
      ),
    ).toBe(SUNSET.bass);
  });

  it('maps base / body water to palette.mid', () => {
    expect(classifyWaterBand({ depthFactor: 0.25, foamAmount: 0.08, crestStrength: 0.05 })).toBe(
      'body',
    );
    expect(
      mapWaterSampleToPaletteColor(
        { depthFactor: 0.3, foamAmount: 0.1, crestStrength: 0.08 },
        OCEAN,
      ),
    ).toBe(OCEAN.mid);
    expect(
      mapWaterSampleToPaletteColor(
        { depthFactor: 0.4, foamAmount: 0.12, crestStrength: 0.1 },
        SUNSET,
      ),
    ).toBe(SUNSET.mid);
  });

  it('maps foam / crests to palette.high, including palette swaps', () => {
    expect(classifyWaterBand({ depthFactor: 0.2, foamAmount: 0.7, crestStrength: 0.2 })).toBe(
      'foam',
    );
    expect(classifyWaterBand({ depthFactor: 0.8, foamAmount: 0.1, crestStrength: 0.65 })).toBe(
      'foam',
    );
    expect(
      mapWaterSampleToPaletteColor(
        { depthFactor: 0.15, foamAmount: 0.55, crestStrength: 0.4 },
        OCEAN,
      ),
    ).toBe(OCEAN.high);
    expect(
      mapWaterSampleToPaletteColor(
        { depthFactor: 0.2, foamAmount: 0.4, crestStrength: 0.5 },
        SUNSET,
      ),
    ).toBe(SUNSET.high);
    expect(paletteColorForBand('foam', SUNSET)).toBe(SUNSET.high);
    expect(paletteColorForBand('deep', SUNSET)).toBe(SUNSET.bass);
    expect(paletteColorForBand('body', SUNSET)).toBe(SUNSET.mid);
  });
});
