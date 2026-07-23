/**
 * Pure tier configuration for Rainforest Reverie — a licensed port of
 * Inigo Quilez's "Rainforest" (https://www.shadertoy.com/view/4ttSWf).
 *
 * The original is a two-pass Shadertoy: Buffer A raymarches the scene with
 * temporal reprojection, the Image pass composites with a vignette. These
 * configs choose the internal Buffer A resolution (relative to the drawing
 * buffer — the temporal filter hides the softness) and the march caps
 * compiled into the shader per quality tier. The high tier keeps the
 * original's shipped LOWQUALITY budgets exactly.
 */

export type RainforestTier = 'high' | 'mid' | 'low';

export interface RainforestPortConfig {
  /** Buffer A resolution as a fraction of the drawing buffer, 0.25..1. */
  bufferScale: number;
  /** Volumetric cloud march cap (original: 128). */
  cloudSteps: number;
  /** Terrain height-field march cap (original: 400). */
  terrainSteps: number;
  /** Tree ellipsoid march cap (original: 64). */
  treeSteps: number;
  /** Terrain sun-shadow march cap (original LOWQUALITY: 32). */
  terrainShadowSteps: number;
  /** Tree sun-shadow march cap (original LOWQUALITY: 64). */
  treeShadowSteps: number;
}

/** March budgets exactly as shipped in the original's LOWQUALITY build. */
export const RAINFOREST_ORIGINAL_BUDGETS = Object.freeze({
  cloudSteps: 128,
  terrainSteps: 400,
  treeSteps: 64,
  terrainShadowSteps: 32,
  treeShadowSteps: 64,
});

export const RAINFOREST_TIER_CONFIGS: Readonly<Record<RainforestTier, RainforestPortConfig>> =
  Object.freeze({
    high: Object.freeze({
      bufferScale: 1,
      ...RAINFOREST_ORIGINAL_BUDGETS,
    }),
    mid: Object.freeze({
      bufferScale: 0.7,
      cloudSteps: 96,
      terrainSteps: 300,
      treeSteps: 56,
      terrainShadowSteps: 24,
      treeShadowSteps: 40,
    }),
    low: Object.freeze({
      bufferScale: 0.5,
      cloudSteps: 64,
      terrainSteps: 220,
      treeSteps: 48,
      terrainShadowSteps: 16,
      treeShadowSteps: 24,
    }),
  });

export function getRainforestPortConfig(tier: RainforestTier): RainforestPortConfig {
  return RAINFOREST_TIER_CONFIGS[tier] ?? RAINFOREST_TIER_CONFIGS.mid;
}

/** Assert config numbers are finite and inside design envelopes. */
export function portConfigIsValid(config: RainforestPortConfig): boolean {
  return (
    Number.isFinite(config.bufferScale) &&
    Number.isFinite(config.cloudSteps) &&
    Number.isFinite(config.terrainSteps) &&
    Number.isFinite(config.treeSteps) &&
    Number.isFinite(config.terrainShadowSteps) &&
    Number.isFinite(config.treeShadowSteps) &&
    config.bufferScale >= 0.25 &&
    config.bufferScale <= 1 &&
    config.cloudSteps >= 24 &&
    config.cloudSteps <= 128 &&
    config.terrainSteps >= 100 &&
    config.terrainSteps <= 400 &&
    config.treeSteps >= 24 &&
    config.treeSteps <= 64 &&
    config.terrainShadowSteps >= 8 &&
    config.terrainShadowSteps <= 32 &&
    config.treeShadowSteps >= 12 &&
    config.treeShadowSteps <= 64
  );
}

/**
 * Buffer A pixel dimensions for a drawing-buffer size, min-clamped so a
 * collapsed layout can never produce a zero-sized render target.
 */
export function bufferSizeFor(
  width: number,
  height: number,
  config: RainforestPortConfig,
): { width: number; height: number } {
  const w = Math.max(8, Math.round((Number.isFinite(width) ? width : 8) * config.bufferScale));
  const h = Math.max(8, Math.round((Number.isFinite(height) ? height : 8) * config.bufferScale));
  return { width: w, height: h };
}
