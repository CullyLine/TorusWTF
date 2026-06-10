/**
 * Call and response — the visual answers the music.
 *
 * Three signals, all 0..1, derived from the live metrics:
 *
 *  - `echo`: phrase memory. We record the rhythm of the last two bars
 *    (per-16th onset strength on the beat grid). When the music opens a gap
 *    (activity falls after a phrase), the recorded rhythm is replayed as an
 *    impulse train — the visual sings the phrase back into the silence.
 *
 *  - `gather`: anticipation. With a confident BPM, this ramps just before
 *    each predicted beat and releases on the hit — the inhale before the
 *    downbeat. Presets use it to pull particles inward pre-beat so the hit
 *    visibly *releases* them.
 *
 *  - `convergence`: how locked-together the bass/mid/high bands currently
 *    are (sliding-window correlation). Choruses and drops converge toward 1;
 *    breakdowns and solos diverge toward 0. The flow core uses it to blend
 *    three per-band fields into one shared current — the "unconscious
 *    collective decision" made visible.
 */

const SLOTS_PER_BAR = 16;
const PATTERN_BARS = 2;
const PATTERN_LEN = SLOTS_PER_BAR * PATTERN_BARS;

export interface CallResponseState {
  /** 0..1 phrase-echo impulse train (already envelope-shaped). */
  echo: number;
  /** 0..1 pre-beat anticipation ramp. */
  gather: number;
  /** 0..1 band-correlation convergence. */
  convergence: number;

  // Internal: phrase memory.
  pattern: Float32Array;
  patternFresh: Float32Array;
  barIndex: number;
  prevBarPhase: number;
  echoMode: boolean;
  echoStartBar: number;
  prevSlot: number;
  activityEma: number;
  hadPhrase: boolean;

  // Internal: correlation accumulators (EMA means / variances / covariances).
  mB: number;
  mM: number;
  mH: number;
  vB: number;
  vM: number;
  vH: number;
  cBM: number;
  cMH: number;
  cBH: number;
}

export function createCallResponseState(): CallResponseState {
  return {
    echo: 0,
    gather: 0,
    convergence: 0,
    pattern: new Float32Array(PATTERN_LEN),
    patternFresh: new Float32Array(PATTERN_LEN),
    barIndex: 0,
    prevBarPhase: 0,
    echoMode: false,
    echoStartBar: 0,
    prevSlot: -1,
    activityEma: 0,
    hadPhrase: false,
    mB: 0.15,
    mM: 0.15,
    mH: 0.15,
    vB: 0.01,
    vM: 0.01,
    vH: 0.01,
    cBM: 0,
    cMH: 0,
    cBH: 0,
  };
}

export interface CallResponseInput {
  bass: number;
  mid: number;
  high: number;
  energy: number;
  beat: number;
  drumActivity: number;
  leadActivity: number;
  vocalActivity: number;
  silence: number;
  bpm: number | null;
  beatPhase: number;
  barPhase: number;
}

export function updateCallResponse(
  state: CallResponseState,
  input: CallResponseInput,
  delta: number,
): void {
  const dt = Math.min(delta, 0.1);
  const hasBpm = input.bpm !== null && input.bpm > 30;

  // ---- Convergence: sliding correlation of the three bands ----
  // ~1.2s window via EMA. Correlation of deviations, averaged pairwise.
  const a = 1 - Math.exp(-dt / 1.2);
  state.mB += (input.bass - state.mB) * a;
  state.mM += (input.mid - state.mM) * a;
  state.mH += (input.high - state.mH) * a;
  const dB = input.bass - state.mB;
  const dM = input.mid - state.mM;
  const dH = input.high - state.mH;
  state.vB += (dB * dB - state.vB) * a;
  state.vM += (dM * dM - state.vM) * a;
  state.vH += (dH * dH - state.vH) * a;
  state.cBM += (dB * dM - state.cBM) * a;
  state.cMH += (dM * dH - state.cMH) * a;
  state.cBH += (dB * dH - state.cBH) * a;
  const eps = 1e-4;
  const rBM = state.cBM / Math.sqrt(Math.max(eps, state.vB * state.vM));
  const rMH = state.cMH / Math.sqrt(Math.max(eps, state.vM * state.vH));
  const rBH = state.cBH / Math.sqrt(Math.max(eps, state.vB * state.vH));
  // Negative correlation reads as divergence; map mean corr -0.2..0.9 → 0..1.
  const meanCorr = (rBM + rMH + rBH) / 3;
  const convTarget = clamp01((meanCorr + 0.2) / 1.1) * (1 - input.silence);
  state.convergence += (convTarget - state.convergence) * Math.min(1, dt * 2.5);

  // ---- Activity envelope (is the music "speaking" right now?) ----
  const activityNow = Math.min(
    1,
    input.drumActivity * 0.8 + input.leadActivity * 0.7 + input.vocalActivity * 0.6 + input.beat,
  );
  state.activityEma += (activityNow - state.activityEma) * Math.min(1, dt * 3);

  if (!hasBpm) {
    // No grid — no phrase memory or anticipation. Decay gracefully.
    state.echo = Math.max(0, state.echo - dt * 2);
    state.gather = Math.max(0, state.gather - dt * 4);
    return;
  }

  // ---- Beat-grid slot tracking ----
  if (input.barPhase < state.prevBarPhase - 0.5) {
    state.barIndex++;
  }
  state.prevBarPhase = input.barPhase;
  const slot =
    (Math.min(SLOTS_PER_BAR - 1, Math.floor(input.barPhase * SLOTS_PER_BAR)) +
      (state.barIndex % PATTERN_BARS) * SLOTS_PER_BAR) %
    PATTERN_LEN;

  // ---- Record phase: capture onset strength into the current slot ----
  if (!state.echoMode) {
    if (slot !== state.prevSlot) {
      // Entering a new slot — start fresh so each pass overwrites the last.
      state.patternFresh[slot] = 0;
    }
    const onset = Math.min(1, input.beat * 0.8 + input.drumActivity * 0.5);
    state.patternFresh[slot] = Math.max(state.patternFresh[slot]!, onset);
    // Commit the freshly-passed slot into the playable pattern.
    if (slot !== state.prevSlot && state.prevSlot >= 0) {
      state.pattern[state.prevSlot] = state.patternFresh[state.prevSlot]!;
      if (state.pattern[state.prevSlot]! > 0.25) state.hadPhrase = true;
    }
  }
  state.prevSlot = slot;

  // ---- Gap detection → enter echo mode ----
  // A phrase just ended: we had onsets recorded, and activity has dropped
  // low while the track isn't in deep silence-reset territory.
  if (!state.echoMode && state.hadPhrase && state.activityEma < 0.12 && input.energy < 0.25) {
    state.echoMode = true;
    state.echoStartBar = state.barIndex;
  }

  // ---- Echo playback ----
  if (state.echoMode) {
    const replaySlot = slot;
    const strength = state.pattern[replaySlot] ?? 0;
    // Sharpen into an impulse at the start of each slot, sustain briefly.
    const slotPhase = input.barPhase * SLOTS_PER_BAR - Math.floor(input.barPhase * SLOTS_PER_BAR);
    const impulse = strength * Math.pow(1 - slotPhase, 3);
    // Echo fades across its lifetime (max 2 bars) and yields if music returns.
    const barsIn = state.barIndex - state.echoStartBar;
    const lifeFade = clamp01(1 - barsIn / PATTERN_BARS);
    const yieldToMusic = clamp01(1 - state.activityEma * 4);
    const target = impulse * lifeFade * yieldToMusic * 0.9;
    state.echo = Math.max(target, state.echo - dt * 3.5);

    if (barsIn >= PATTERN_BARS || state.activityEma > 0.3) {
      state.echoMode = false;
      state.hadPhrase = false;
      state.pattern.fill(0);
      state.patternFresh.fill(0);
    }
  } else {
    state.echo = Math.max(0, state.echo - dt * 3.5);
  }

  // ---- Gather: pre-beat anticipation ----
  // Ramps over the last 30% of the beat, vanishes at the hit. Only leans in
  // when there's actually a groove to anticipate.
  const groove = clamp01(state.activityEma * 2) * (1 - input.silence);
  const ramp = smoothstep(0.7, 0.98, input.beatPhase);
  const gatherTarget = ramp * groove;
  // Fast attack, instant-ish release (the beat *releases* the gather).
  const ga = gatherTarget > state.gather ? Math.min(1, dt * 14) : Math.min(1, dt * 20);
  state.gather += (gatherTarget - state.gather) * ga;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
