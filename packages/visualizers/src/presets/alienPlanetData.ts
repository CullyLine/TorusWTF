/**
 * Pure tier budgets + palette-band mapping for Alien Planet.
 * The preset is a raymarched height-field canopy world; these budgets are
 * compiled into the fragment shader as loop bounds so every tier has hard
 * caps. No Math.random — every classification is deterministic from sample
 * metrics.
 *
 * (This preset began life as the clean-room "Rainforest Reverie" build; it
 * was renamed when the real iq Rainforest port took over that preset id.)
 */

export type AlienPlanetTier = 'high' | 'mid' | 'low';

export interface AlienPlanetBudgets {
  /** Hard max height-field march steps (coarse trace). */
  traceSteps: number;
  /** Fixed binary-refine iterations after a coarse bracket. */
  refineSteps: number;
  /** Hill fbm octaves compiled into the terrain. */
  hillOctaves: number;
  /** Leaf-detail bump octaves applied at the shading point. */
  detailOctaves: number;
  /** Sun-occlusion march steps (0 = slope/dome shading only on low). */
  shadowSteps: number;
  /** Valley-mist accumulation samples along the view ray. */
  mistSamples: number;
  /** Sky cloud fbm octaves. */
  cloudOctaves: number;
}

/**
 * Explicit per-tier caps. Low keeps the full concept — terrain, canopy,
 * mist, sky — with shadow marching as the only quality-tier casualty.
 */
export const ALIEN_PLANET_TIER_BUDGETS: Readonly<Record<AlienPlanetTier, AlienPlanetBudgets>> =
  Object.freeze({
    high: Object.freeze({
      traceSteps: 92,
      refineSteps: 6,
      hillOctaves: 4,
      detailOctaves: 3,
      shadowSteps: 6,
      mistSamples: 4,
      cloudOctaves: 4,
    }),
    mid: Object.freeze({
      traceSteps: 60,
      refineSteps: 5,
      hillOctaves: 4,
      detailOctaves: 2,
      shadowSteps: 3,
      mistSamples: 2,
      cloudOctaves: 3,
    }),
    low: Object.freeze({
      traceSteps: 38,
      refineSteps: 4,
      hillOctaves: 3,
      detailOctaves: 2,
      shadowSteps: 0,
      mistSamples: 1,
      cloudOctaves: 2,
    }),
  });

export function getAlienPlanetBudgets(tier: AlienPlanetTier): AlienPlanetBudgets {
  return ALIEN_PLANET_TIER_BUDGETS[tier] ?? ALIEN_PLANET_TIER_BUDGETS.mid;
}

export type AlienPlanetPaletteBand = 'ground' | 'canopy' | 'glint';

export interface AlienPlanetPalette {
  bass: string;
  mid: string;
  high: string;
}

export interface CanopySampleMetrics {
  /** 0..1 crown coverage at the sample — bare terrain sits near 0. */
  canopyCover: number;
  /** 0..1 sun-glint / wet-leaf sparkle strength at the sample. */
  glintStrength: number;
  /** 0..1 shade depth (valley shadow, under-crown occlusion). */
  shadeDepth: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Classify a canopy shading sample into a palette band.
 * Glints win over canopy; bare or deeply shaded ground reads as bass.
 */
export function classifyCanopyBand(sample: CanopySampleMetrics): AlienPlanetPaletteBand {
  const cover = clamp01(sample.canopyCover);
  const glint = clamp01(sample.glintStrength);
  const shade = clamp01(sample.shadeDepth);

  // Wet-leaf sparkle / sun tips always map to the high band.
  if (glint >= 0.5) return 'glint';

  // Bare terrain, or canopy sunk fully into shade, reads as ground/bass.
  if (cover < 0.35 || shade >= 0.82) return 'ground';

  return 'canopy';
}

/** Map a classified canopy band onto the living palette colors. */
export function paletteColorForBand(
  band: AlienPlanetPaletteBand,
  palette: AlienPlanetPalette,
): string {
  if (band === 'ground') return palette.bass;
  if (band === 'glint') return palette.high;
  return palette.mid;
}

/**
 * Convenience: sample metrics → palette color string for the owning band.
 * Used by tests to prove band→color contracts across palette swaps.
 */
export function mapCanopySampleToPaletteColor(
  sample: CanopySampleMetrics,
  palette: AlienPlanetPalette,
): string {
  return paletteColorForBand(classifyCanopyBand(sample), palette);
}

/** Assert budget numbers are finite and inside design envelopes. */
export function budgetsAreValid(budgets: AlienPlanetBudgets): boolean {
  return (
    Number.isFinite(budgets.traceSteps) &&
    Number.isFinite(budgets.refineSteps) &&
    Number.isFinite(budgets.hillOctaves) &&
    Number.isFinite(budgets.detailOctaves) &&
    Number.isFinite(budgets.shadowSteps) &&
    Number.isFinite(budgets.mistSamples) &&
    Number.isFinite(budgets.cloudOctaves) &&
    budgets.traceSteps >= 16 &&
    budgets.traceSteps <= 160 &&
    budgets.refineSteps >= 2 &&
    budgets.refineSteps <= 16 &&
    budgets.hillOctaves >= 2 &&
    budgets.hillOctaves <= 8 &&
    budgets.detailOctaves >= 1 &&
    budgets.detailOctaves <= 6 &&
    budgets.shadowSteps >= 0 &&
    budgets.shadowSteps <= 24 &&
    budgets.mistSamples >= 1 &&
    budgets.mistSamples <= 12 &&
    budgets.cloudOctaves >= 1 &&
    budgets.cloudOctaves <= 8
  );
}
