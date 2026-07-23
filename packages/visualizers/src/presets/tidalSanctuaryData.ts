/**
 * Pure tier budgets + palette-band mapping for Tidal Sanctuary.
 * No Math.random — every classification is deterministic from sample metrics.
 */

export type TidalTier = 'high' | 'mid' | 'low';

export interface TidalBudgets {
  /** Hard max height-field intersection steps (coarse march). */
  traceSteps: number;
  /** Fixed binary-refine iterations after a coarse hit/bracket. */
  refineSteps: number;
  /** Directional wave octaves compiled into the height field. */
  waveOctaves: number;
}

/** Explicit per-tier caps. Low retains a complete ocean (steps + octaves > 0). */
export const TIDAL_TIER_BUDGETS: Readonly<Record<TidalTier, TidalBudgets>> = Object.freeze({
  high: Object.freeze({
    traceSteps: 56,
    refineSteps: 6,
    waveOctaves: 5,
  }),
  mid: Object.freeze({
    traceSteps: 36,
    refineSteps: 5,
    waveOctaves: 4,
  }),
  low: Object.freeze({
    traceSteps: 22,
    refineSteps: 4,
    waveOctaves: 3,
  }),
});

export type TidalPaletteBand = 'deep' | 'body' | 'foam';

export interface TidalPalette {
  bass: string;
  mid: string;
  high: string;
}

export interface WaterSampleMetrics {
  /**
   * 0..1 optical / geometric depth attenuation — troughs and far water sit high.
   * Deep water must dominate when this is elevated and foam is quiet.
   */
  depthFactor: number;
  /** 0..1 sea-foam / crest coverage at the sample. */
  foamAmount: number;
  /** 0..1 crest sparkle / specular accent strength. */
  crestStrength: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function getTidalBudgets(tier: TidalTier): TidalBudgets {
  return TIDAL_TIER_BUDGETS[tier] ?? TIDAL_TIER_BUDGETS.mid;
}

/**
 * Classify a water shading sample into a palette band.
 * Foam/crests win over body; deep troughs win over mid body when quiet.
 */
export function classifyWaterBand(sample: WaterSampleMetrics): TidalPaletteBand {
  const depth = clamp01(sample.depthFactor);
  const foam = clamp01(sample.foamAmount);
  const crest = clamp01(sample.crestStrength);
  const foamScore = Math.max(foam, crest * 0.92);

  // Crest sparkle / foam always maps to the high band.
  if (foamScore >= 0.28) return 'foam';

  // Genuine deep water / troughs / depth attenuation → bass.
  if (depth >= 0.55 && foamScore < 0.18) return 'deep';

  // Dominant base water body.
  return 'body';
}

/** Map a classified water band onto the living palette colors. */
export function paletteColorForBand(band: TidalPaletteBand, palette: TidalPalette): string {
  if (band === 'deep') return palette.bass;
  if (band === 'foam') return palette.high;
  return palette.mid;
}

/**
 * Convenience: sample metrics → palette color string for the owning band.
 * Used by tests to prove band→color contracts across palette swaps.
 */
export function mapWaterSampleToPaletteColor(
  sample: WaterSampleMetrics,
  palette: TidalPalette,
): string {
  return paletteColorForBand(classifyWaterBand(sample), palette);
}

/** Assert budget numbers are finite positives inside design envelopes. */
export function budgetsAreValid(budgets: TidalBudgets): boolean {
  return (
    Number.isFinite(budgets.traceSteps) &&
    Number.isFinite(budgets.refineSteps) &&
    Number.isFinite(budgets.waveOctaves) &&
    budgets.traceSteps >= 8 &&
    budgets.traceSteps <= 128 &&
    budgets.refineSteps >= 2 &&
    budgets.refineSteps <= 16 &&
    budgets.waveOctaves >= 2 &&
    budgets.waveOctaves <= 8
  );
}
