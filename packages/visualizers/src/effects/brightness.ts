/**
 * Rendering-only brightness limits. Audio metrics stay untouched so motion
 * remains expressive; these helpers bound only the values that feed light
 * and post-processing intensity.
 */

export const MAX_BLOOM_INTENSITY = 3.25;
export const MAX_LIGHT_SIGNAL = 1.25;
export const MAX_REACTIVE_LIGHT_INTENSITY = 8;
export const MAX_FLASH_LIGHT_BOOST = 1.35;

export const HIGHLIGHT_GUARD_THRESHOLD = 0.82;
export const HIGHLIGHT_GUARD_KNEE = 0.16;

function clampFinite(value: number, min: number, max: number, fallback = min): number {
  if (Number.isNaN(value)) return fallback;
  if (value === Number.POSITIVE_INFINITY) return max;
  if (value === Number.NEGATIVE_INFINITY) return min;
  return value < min ? min : value > max ? max : value;
}

/**
 * Keeps any one audio signal from making a scene light arbitrarily bright.
 * This is deliberately separate from metrics normalization and camera motion.
 */
export function clampLightSignal(value: number): number {
  return clampFinite(value, 0, MAX_LIGHT_SIGNAL);
}

/** A repeated flash trigger cannot stack beyond this additive light boost. */
export function calculateFlashLightBoost(flashEnvelope: number): number {
  return clampFinite(flashEnvelope, 0, 1) * MAX_FLASH_LIGHT_BOOST;
}

/** Final defensive cap for a single reactive scene light. */
export function clampReactiveLightIntensity(intensity: number): number {
  return clampFinite(intensity, 0, MAX_REACTIVE_LIGHT_INTENSITY);
}

export interface BloomResponseInput {
  baseIntensity: number;
  breath: number;
  gather: number;
  hit: number;
  bloomPulse: number;
  flash: number;
}

/**
 * Musical bloom response with independently bounded continuous and trigger
 * contributions. Values in the ordinary range keep the previous response;
 * extreme metrics and repeated impulses converge on a finite ceiling.
 */
export function calculateBoundedBloomIntensity({
  baseIntensity,
  breath,
  gather,
  hit,
  bloomPulse,
  flash,
}: BloomResponseInput): number {
  const base = clampFinite(baseIntensity, 0, 3);
  const response =
    clampFinite(breath, 0, 1.6) +
    clampFinite(gather, 0, 1) * 0.28 +
    clampFinite(hit, 0, 1.2) * 0.16 +
    clampFinite(bloomPulse, 0, 1) * 0.65 +
    clampFinite(flash, 0, 1) * 0.25;

  return Math.min(MAX_BLOOM_INTENSITY, base * Math.min(response, 2.25));
}

/**
 * Hue-preserving soft-knee compression used by the final highlight guard.
 * Scaling all channels by the same factor preserves RGB ratios while the
 * asymptotic ceiling (threshold + knee) keeps the display from clipping.
 */
export function compressHighlightRgb(
  rgb: readonly [number, number, number],
  threshold = HIGHLIGHT_GUARD_THRESHOLD,
  knee = HIGHLIGHT_GUARD_KNEE,
): [number, number, number] {
  const safeThreshold = clampFinite(threshold, 0, 1, HIGHLIGHT_GUARD_THRESHOLD);
  const safeKnee = clampFinite(knee, 1e-4, Math.max(1e-4, 1 - safeThreshold), HIGHLIGHT_GUARD_KNEE);
  const color = rgb.map((channel) => (Number.isFinite(channel) ? channel : 0)) as [
    number,
    number,
    number,
  ];
  const peak = Math.max(0, color[0], color[1], color[2]);
  if (peak <= safeThreshold) return color;

  const excess = peak - safeThreshold;
  const compressedPeak = safeThreshold + excess / (1 + excess / safeKnee);
  const scale = compressedPeak / peak;
  return [color[0] * scale, color[1] * scale, color[2] * scale];
}
