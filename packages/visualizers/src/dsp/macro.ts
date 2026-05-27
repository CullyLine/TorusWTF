/**
 * Macro-dynamics: silence / tension / drop detection as musical events.
 *
 * These are heuristic-only — there's no ML — but they encode the patterns
 * that humans recognize as silence, building tension, and that climactic
 * moment when the bass drops.
 *
 * Outputs are 0..1 values that presets can react to.
 */

export interface MacroState {
  /** 0..1: 0 = active audio, 1 = sustained quiet (>0.4s of near-silence). */
  silence: number;
  /** 0..1: climbing tension (filter sweep, snare roll, sub-bass dropout). */
  tension: number;
  /** 0..1: pulses to ~1 on detected drop, decays over ~2 beats. */
  dropEvent: number;
  /** Internal: spectral centroid history for tension trend. */
  centroidHist: Float32Array;
  centroidHistIdx: number;
  /** Internal: sustained-silence counter (seconds). */
  silenceCounter: number;
  /** Internal: drop state machine. */
  dropPhase: 'idle' | 'armed' | 'firing' | 'recovering';
  dropArmedAt: number;
  dropFiredAt: number;
  /** Internal: previous bass for transient detection. */
  prevBass: number;
  prevEnergy: number;
}

const CENTROID_HIST_LEN = 64; // ~1 second at 60fps

export function createMacroState(): MacroState {
  return {
    silence: 0,
    tension: 0,
    dropEvent: 0,
    centroidHist: new Float32Array(CENTROID_HIST_LEN),
    centroidHistIdx: 0,
    silenceCounter: 0,
    dropPhase: 'idle',
    dropArmedAt: 0,
    dropFiredAt: 0,
    prevBass: 0,
    prevEnergy: 0,
  };
}

export interface MacroInput {
  energy: number;
  bass: number;
  high: number;
  /** Spectral centroid in Hz, computed from FFT. */
  centroidHz: number;
  /** Drum activity 0..1, used for snare-roll detection. */
  drumActivity: number;
  /** BPM if known, used to time drop decay. null = use a 2-second default. */
  bpm: number | null;
}

/**
 * Update macro state in place. Call every frame. `delta` is seconds since
 * previous frame, `nowSec` is the absolute timestamp for drop timing.
 */
export function updateMacro(
  state: MacroState,
  input: MacroInput,
  delta: number,
  nowSec: number,
): void {
  // ---- Silence detection ----
  // Energy below 0.05 sustained for >0.4s = silence.
  if (input.energy < 0.05) {
    state.silenceCounter += delta;
  } else {
    state.silenceCounter = Math.max(0, state.silenceCounter - delta * 4);
  }
  const silenceTarget =
    state.silenceCounter > 0.4
      ? Math.min(1, (state.silenceCounter - 0.4) * 2)
      : 0;
  state.silence = state.silence * 0.85 + silenceTarget * 0.15;

  // ---- Centroid history (for tension) ----
  state.centroidHist[state.centroidHistIdx] = input.centroidHz;
  state.centroidHistIdx = (state.centroidHistIdx + 1) % CENTROID_HIST_LEN;

  // Tension: rising centroid trend + active drums + sub-bass dropout.
  // Take simple linear-regression slope across the centroid history.
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumXX = 0;
  for (let i = 0; i < CENTROID_HIST_LEN; i++) {
    const x = i;
    const y = state.centroidHist[i]!;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const meanY = sumY / CENTROID_HIST_LEN;
  const denom = sumXX - (sumX * sumX) / CENTROID_HIST_LEN;
  const slope = denom > 0 ? (sumXY - (sumX * sumY) / CENTROID_HIST_LEN) / denom : 0;
  // Normalize slope to 0..1. Typical rising-sweep gives slope ~50-200 Hz/frame.
  const slopeNorm = Math.min(1, Math.max(0, slope / 80));
  // Bass dropout: tension climbs when bass is low (classic build pattern).
  const bassDropoutFactor = Math.max(0, 1 - input.bass * 3);
  // Final tension: a weighted blend, smoothed.
  const tensionTarget = Math.min(
    1,
    slopeNorm * 0.55 + input.drumActivity * 0.35 * bassDropoutFactor + bassDropoutFactor * 0.1,
  );
  // Asymmetric smoothing: tension rises moderately, falls quickly.
  const tensionAlpha = tensionTarget > state.tension ? 0.06 : 0.2;
  state.tension = state.tension * (1 - tensionAlpha) + tensionTarget * tensionAlpha;
  void meanY; // computed for parity with formal slope formulae

  // ---- Drop state machine ----
  // Bass + energy spike vs recent average = drop candidate.
  const bassSpike = input.bass - state.prevBass;
  const energySpike = input.energy - state.prevEnergy;
  const dropPeriod = input.bpm && input.bpm > 30 ? (60 / input.bpm) * 2 : 2.0;

  switch (state.dropPhase) {
    case 'idle':
      if (state.tension > 0.55) {
        state.dropPhase = 'armed';
        state.dropArmedAt = nowSec;
      }
      break;
    case 'armed':
      // Stay armed for up to 4 seconds. If a big bass+energy spike happens
      // while armed, fire. If tension drops without a spike, return to idle.
      if (nowSec - state.dropArmedAt > 4 || state.tension < 0.3) {
        state.dropPhase = 'idle';
      } else if (bassSpike > 0.18 && energySpike > 0.12 && input.bass > 0.4) {
        state.dropPhase = 'firing';
        state.dropFiredAt = nowSec;
        state.dropEvent = 1;
      }
      break;
    case 'firing':
      // Hold the pulse for a single frame so it's visible regardless of timing,
      // then transition to recovering.
      state.dropPhase = 'recovering';
      break;
    case 'recovering': {
      const sinceFire = nowSec - state.dropFiredAt;
      state.dropEvent = Math.max(0, 1 - sinceFire / dropPeriod);
      if (sinceFire > dropPeriod) {
        state.dropPhase = 'idle';
        state.dropEvent = 0;
      }
      break;
    }
  }

  state.prevBass = state.prevBass * 0.7 + input.bass * 0.3;
  state.prevEnergy = state.prevEnergy * 0.7 + input.energy * 0.3;
}
