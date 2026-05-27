/**
 * Choreography — the layer that converts audio signals into emotional intent.
 *
 * Track A (BPM / stems / macro / mood) gives us the *signals*. This layer
 * gives the creature *feelings*: anticipation (leanIn), focused stillness
 * (holdBreath), exhale (release), accumulated mood (moodMemory), and
 * gentleness (tenderness).
 *
 * Personality (from the hidden creature) biases the choreography weights
 * by +/-20% so two viewings of the same song feel slightly different.
 */

import type { CreaturePersonality } from './creature';

export interface ChoreographyState {
  /** 0..1: creature leaning forward to listen as tension climbs. */
  leanIn: number;
  /** 0..1: creature holding still during silence, paying close attention. */
  holdBreath: number;
  /** 0..1: pulses on bass drops, decays as the exhale settles. */
  release: number;
  /** Long-EMA of arousal/valence; the creature's current state of being. */
  moodMemory: { arousal: number; valence: number };
  /** 0..1: response to gentle vocal passages (warm halos, soft bloom). */
  tenderness: number;
}

export function createChoreographyState(): ChoreographyState {
  return {
    leanIn: 0,
    holdBreath: 0,
    release: 0,
    moodMemory: { arousal: 0.2, valence: 0 },
    tenderness: 0,
  };
}

export interface ChoreographyInput {
  tension: number;
  silence: number;
  dropEvent: number;
  arousal: number;
  valence: number;
  vocalActivity: number;
}

/**
 * Update choreography state in place. Call every frame.
 *
 * `delta` is seconds since previous frame. `personality` (optional) biases
 * each output by +/-20% — subtle enough that it never breaks the feel but
 * enough to give the creature taste.
 */
export function updateChoreography(
  state: ChoreographyState,
  input: ChoreographyInput,
  delta: number,
  personality?: CreaturePersonality,
): void {
  const dt = Math.min(delta, 0.1);

  // Personality biases. ±20% on the relevant outputs.
  const tempoBias = personality?.tempoBias ?? 0; // affects leanIn pace
  const warmthBias = personality?.warmthBias ?? 0; // affects tenderness
  const midAff = personality?.midAffinity ?? 0; // vocals live in the mid band
  const tensionGain = 1 + tempoBias * 0.2;
  const tenderGain = 1 + (warmthBias * 0.15 + midAff * 0.1);

  // Lean-in: tracks tension with slight ahead-of-curve lag (5x faster up
  // than down — creature leans in eagerly, settles back slowly).
  const leanTarget = Math.min(1, input.tension * tensionGain);
  const leanAlpha = leanTarget > state.leanIn ? Math.min(1, dt * 4) : Math.min(1, dt * 0.8);
  state.leanIn = state.leanIn + (leanTarget - state.leanIn) * leanAlpha;

  // Hold-breath: tracks silence closely.
  const holdAlpha = Math.min(1, dt * 3);
  state.holdBreath = state.holdBreath + (input.silence - state.holdBreath) * holdAlpha;

  // Release: pulses on dropEvent, decays slowly afterward. We take max
  // so a fresh drop always wins over a previous one's tail.
  state.release = Math.max(state.release - dt * 0.6, input.dropEvent);

  // Mood memory: ~20-second EMA. Provides the "where the creature is at"
  // that resists momentary fluctuations.
  const moodAlpha = Math.min(1, dt / 20);
  state.moodMemory.arousal += (input.arousal - state.moodMemory.arousal) * moodAlpha;
  state.moodMemory.valence += (input.valence - state.moodMemory.valence) * moodAlpha;

  // Tenderness: high vocal activity AND low arousal AND low silence
  // (so not silence-tenderness, but active-but-gentle).
  const tenderRaw =
    input.vocalActivity *
    Math.max(0, 1 - input.arousal * 1.2) *
    Math.max(0, 1 - input.silence);
  const tenderTarget = Math.min(1, tenderRaw * tenderGain);
  const tenderAlpha = Math.min(1, dt * 2);
  state.tenderness = state.tenderness + (tenderTarget - state.tenderness) * tenderAlpha;
}
