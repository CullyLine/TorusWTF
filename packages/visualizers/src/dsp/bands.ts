/**
 * Perceptual frequency-band extraction with smooth crossovers.
 *
 * The original band split used hard, non-overlapping bin ranges
 * (`[0,s1) [s1,s2) [s2,bins)`). When a spectral peak drifted across a
 * boundary bin its energy "teleported" from one band to the next, so a
 * band would suddenly drop out while its neighbour jumped — the
 * "rubberbanding" the visuals exhibited.
 *
 * Instead we give every bin a smooth raised-cosine membership in the bass,
 * mid, and high bands. The three weights form a partition of unity (they
 * sum to exactly 1 at every frequency), so energy crossing a crossover
 * fades continuously between bands rather than jumping.
 *
 * Magnitudes are also passed through a mild perceptual curve before
 * averaging so quiet musical detail is lifted into a usable range — this
 * is what lets the visualizer react well without cranking the gain.
 *
 * This module is intentionally pure and DOM-free: it is the seed of the
 * routable "modulation layer" the builder will expose to users.
 */

export interface BandConfig {
  /** Upper edge of the bass band, in Hz. */
  bassMaxHz: number;
  /** Upper edge of the mid band, in Hz. */
  midMaxHz: number;
  /**
   * Crossover transition half-width as a fraction of the crossover
   * frequency. 0 = hard cut (legacy behaviour); larger = gentler blend.
   * Default 0.5 (roughly a half-octave fade on each side).
   */
  crossoverWidth?: number;
  /**
   * Perceptual curve exponent applied to each normalized bin magnitude
   * (0..1) before averaging. < 1 lifts low-level detail (e.g. 0.6); 1 is
   * linear. Loosely approximates loudness compression.
   */
  perceptualExponent?: number;
}

export interface BandLevels {
  /** 0..1 weighted bass energy. */
  bass: number;
  /** 0..1 weighted mid energy. */
  mid: number;
  /** 0..1 weighted high energy. */
  high: number;
  /** 0..1 full-spectrum average — a continuous "motion" signal. */
  full: number;
}

export interface BandWeights {
  bass: number;
  mid: number;
  high: number;
}

const DEFAULT_CROSSOVER_WIDTH = 0.5;
const DEFAULT_PERCEPTUAL_EXPONENT = 0.6;

/**
 * Monotonic raised-cosine ramp from 0 to 1, centered at `center` with a
 * transition half-width of `halfWidth` (same units as `f`). Below
 * `center - halfWidth` it is 0; above `center + halfWidth` it is 1.
 */
function ramp(f: number, center: number, halfWidth: number): number {
  if (halfWidth <= 0) return f >= center ? 1 : 0;
  const t = (f - (center - halfWidth)) / (2 * halfWidth);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 0.5 - 0.5 * Math.cos(Math.PI * t);
}

/**
 * Band membership weights at a given frequency. Always sums to 1.
 *
 * Because the bass ramp is centered below the high ramp and both ramps are
 * the same monotonic shape, `rampUp1(f) >= rampUp2(f)` for all f, so the
 * mid weight is never negative.
 */
export function bandWeightsAtHz(freqHz: number, config: BandConfig): BandWeights {
  const width = config.crossoverWidth ?? DEFAULT_CROSSOVER_WIDTH;
  const c1 = config.bassMaxHz;
  const c2 = Math.max(config.bassMaxHz, config.midMaxHz);
  const rampUp1 = ramp(freqHz, c1, c1 * width);
  const rampUp2 = ramp(freqHz, c2, c2 * width);
  return {
    bass: 1 - rampUp1,
    mid: rampUp1 - rampUp2,
    high: rampUp2,
  };
}

/**
 * Extract perceptual bass/mid/high/full levels from a byte FFT buffer.
 *
 * @param freqData byte magnitudes (0..255), as filled by `getByteFrequencyData`
 * @param binCount number of valid bins in `freqData`
 * @param sampleRate audio context sample rate in Hz
 */
export function extractBands(
  freqData: Uint8Array,
  binCount: number,
  sampleRate: number,
  config: BandConfig,
): BandLevels {
  if (binCount <= 0) return { bass: 0, mid: 0, high: 0, full: 0 };

  const nyquist = sampleRate / 2;
  const binWidth = nyquist / binCount;
  const exponent = config.perceptualExponent ?? DEFAULT_PERCEPTUAL_EXPONENT;

  let bassAcc = 0;
  let midAcc = 0;
  let highAcc = 0;
  let bassW = 0;
  let midW = 0;
  let highW = 0;
  let fullAcc = 0;

  for (let i = 0; i < binCount; i++) {
    const norm = (freqData[i] ?? 0) / 255;
    const m = exponent === 1 ? norm : Math.pow(norm, exponent);
    fullAcc += m;

    // Center frequency of this bin.
    const f = (i + 0.5) * binWidth;
    const w = bandWeightsAtHz(f, config);
    bassAcc += w.bass * m;
    midAcc += w.mid * m;
    highAcc += w.high * m;
    bassW += w.bass;
    midW += w.mid;
    highW += w.high;
  }

  return {
    bass: bassW > 1e-6 ? bassAcc / bassW : 0,
    mid: midW > 1e-6 ? midAcc / midW : 0,
    high: highW > 1e-6 ? highAcc / highW : 0,
    full: fullAcc / binCount,
  };
}
