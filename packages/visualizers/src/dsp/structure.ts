/**
 * Song-structure awareness — where does THIS moment sit in THIS song?
 *
 * Raw band levels answer "how loud is it right now"; these signals answer
 * "how big is this moment relative to everything the song has done so
 * far". That difference is what lets visuals feel the song instead of
 * just hearing the signal:
 *
 *  - `sectionLevel` (0..1): the current intensity's percentile against a
 *    rolling ~48s history. 0.9+ = the biggest thing the song has done,
 *    0.2 = a quiet valley. Rises quickly when a section opens up, but
 *    RELEASES SLOWLY (~4s) — so when a chorus ends, the visual state
 *    eases down instead of snapping. This is the "linger".
 *
 *  - `afterglow` (0..1): the warm hold after a peak. Excited by drops and
 *    by being in the song's top range; once the source fades it decays
 *    over ~6.5s. Drive residual saturation, bloom, and light warmth from
 *    this so big moments leave a visible trace instead of vanishing.
 *
 * Intentionally fed with the PRE-AGC level: auto-gain exists to flatten
 * loudness differences, which is exactly the information section
 * detection needs preserved.
 */

export interface StructureState {
  /** Ring buffer of ~250ms window means covering ~48s of history. */
  hist: Float32Array;
  histIdx: number;
  histCount: number;
  /** Accumulator for the in-progress window. */
  winAccum: number;
  winTime: number;
  /** 0..1 song-relative intensity percentile, slew-limited. */
  sectionLevel: number;
  /** 0..1 lingering warmth after peaks/drops. */
  afterglow: number;
}

const WINDOW_SEC = 0.25;
const HIST_LEN = 192; // 192 windows x 250ms = 48 seconds of song memory
const MIN_WINDOWS = 12; // ~3s of history before claiming to know the song

const SECTION_RISE_TAU = 0.8;
const SECTION_FALL_TAU = 4.0; // the linger: sections exhale over seconds
const AFTERGLOW_RISE_TAU = 0.35;
const AFTERGLOW_FALL_TAU = 6.5;

export function createStructureState(): StructureState {
  return {
    hist: new Float32Array(HIST_LEN),
    histIdx: 0,
    histCount: 0,
    winAccum: 0,
    winTime: 0,
    sectionLevel: 0.35,
    afterglow: 0,
  };
}

/**
 * Advance the structure state one frame.
 *
 * @param rawLevel Pre-AGC full-spectrum level (0..~1). Real loudness.
 * @param dropEvent Current drop pulse from the macro layer (0..1).
 * @param dt Seconds since last frame (clamped by caller).
 * @param releaseScale Multiplier on the FALL taus only (the Linger control).
 *   1 = default feel; 3 = section ends and afterglow take ~3x longer to fade.
 */
export function updateStructure(
  state: StructureState,
  rawLevel: number,
  dropEvent: number,
  dt: number,
  releaseScale = 1,
): void {
  // ---- Rolling history of window means ----
  state.winAccum += rawLevel * dt;
  state.winTime += dt;
  if (state.winTime >= WINDOW_SEC) {
    state.hist[state.histIdx] = state.winAccum / state.winTime;
    state.histIdx = (state.histIdx + 1) % HIST_LEN;
    if (state.histCount < HIST_LEN) state.histCount++;
    state.winAccum = 0;
    state.winTime = 0;
  }

  // ---- Section level: percentile vs history, asymmetric slew ----
  if (state.histCount >= MIN_WINDOWS) {
    let below = 0;
    for (let i = 0; i < state.histCount; i++) {
      if (state.hist[i]! < rawLevel) below++;
    }
    const pct = below / state.histCount;
    const tau =
      pct > state.sectionLevel ? SECTION_RISE_TAU : SECTION_FALL_TAU * Math.max(0.25, releaseScale);
    state.sectionLevel += (pct - state.sectionLevel) * (1 - Math.exp(-dt / tau));
  } else {
    // Song just started: drift toward neutral rather than guessing.
    state.sectionLevel += (0.5 - state.sectionLevel) * (1 - Math.exp(-dt / 2));
  }

  // ---- Afterglow: fast excite, slow release ----
  // "Peakness" turns on smoothly as sectionLevel enters the song's top
  // range; drops always excite fully.
  const peakness = smooth01((state.sectionLevel - 0.72) / 0.2);
  const excite = Math.max(dropEvent, peakness);
  if (excite > state.afterglow) {
    state.afterglow += (excite - state.afterglow) * (1 - Math.exp(-dt / AFTERGLOW_RISE_TAU));
  } else {
    state.afterglow *= Math.exp(-dt / (AFTERGLOW_FALL_TAU * Math.max(0.25, releaseScale)));
  }
}

function smooth01(v: number): number {
  const c = v < 0 ? 0 : v > 1 ? 1 : v;
  return c * c * (3 - 2 * c);
}
