/**
 * Adaptive resolution.
 *
 * Measured on a machine with no usable GPU, frame rate tracks pixel count
 * almost exactly: the same scene runs at 8fps at 1280x720, 38fps at 640x360
 * and 60fps at 320x180. Almost none of that is scene complexity — it is fill
 * rate and the per-pixel post chain. Resolution is therefore the one knob
 * worth turning automatically, and it is also the cheapest: `setDpr` does not
 * recreate the GL context, recompile shaders or reallocate geometry the way
 * changing device tier would.
 *
 * Smoothness is worth more than sharpness. A visualizer that holds 60fps at
 * three quarter resolution reads better than one that stutters at full.
 *
 * The decision logic lives here as a pure reducer so the hysteresis can be
 * tested without a renderer.
 */

/** Multipliers applied to the base DPR, best first. */
export const RESOLUTION_STEPS = [1, 0.85, 0.72, 0.6, 0.5, 0.4, 0.32] as const;

export interface GovernorConfig {
  /** Drop a step when the median frame time is worse than this. */
  downshiftMs: number;
  /** Climb a step only when comfortably better than this. */
  upshiftMs: number;
  /** Frames of evidence before dropping. Small: stutter should be fixed fast. */
  downshiftFrames: number;
  /** Frames of evidence before climbing. Large: never oscillate. */
  upshiftFrames: number;
}

export const DEFAULT_GOVERNOR_CONFIG: GovernorConfig = {
  // ~48fps. Below this the motion visibly judders.
  downshiftMs: 20.8,
  // ~68fps of headroom before spending it on pixels again.
  upshiftMs: 14.7,
  downshiftFrames: 30,
  upshiftFrames: 240,
};

export interface GovernorState {
  /** Index into `RESOLUTION_STEPS`. */
  step: number;
  /** Consecutive frames spent over `downshiftMs`. */
  slowFrames: number;
  /** Consecutive frames spent under `upshiftMs`. */
  fastFrames: number;
}

export function createGovernorState(step = 0): GovernorState {
  return { step, slowFrames: 0, fastFrames: 0 };
}

/**
 * Folds one frame time into the governor. Returns the same object, mutated,
 * because this runs every frame and must not allocate.
 */
export function advanceGovernor(
  state: GovernorState,
  frameMs: number,
  config: GovernorConfig = DEFAULT_GOVERNOR_CONFIG,
): GovernorState {
  // Discard nonsense and multi-second stalls (tab switches, shader compiles).
  // The real protection against over-reacting is the consecutive-frame
  // requirement below, so this ceiling stays high enough that genuinely awful
  // sustained performance -- the case that most needs help -- still counts.
  if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 2000) return state;

  if (frameMs > config.downshiftMs) {
    state.slowFrames++;
    state.fastFrames = 0;
  } else if (frameMs < config.upshiftMs) {
    state.fastFrames++;
    state.slowFrames = 0;
  } else {
    // In the dead band between the thresholds, hold position and let both
    // counters decay so a mixed workload does not creep toward a change.
    state.slowFrames = Math.max(0, state.slowFrames - 1);
    state.fastFrames = Math.max(0, state.fastFrames - 1);
  }

  if (state.slowFrames >= config.downshiftFrames && state.step < RESOLUTION_STEPS.length - 1) {
    state.step++;
    state.slowFrames = 0;
    state.fastFrames = 0;
  } else if (state.fastFrames >= config.upshiftFrames && state.step > 0) {
    state.step--;
    state.slowFrames = 0;
    state.fastFrames = 0;
  }

  return state;
}

export function resolutionScaleFor(state: GovernorState): number {
  return RESOLUTION_STEPS[Math.min(state.step, RESOLUTION_STEPS.length - 1)]!;
}
