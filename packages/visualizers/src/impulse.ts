/**
 * Visual impulses — one-shot commands fired INTO the scene from outside the
 * canvas (trigger mappings, MIDI notes, keyboard, projector sync).
 *
 * The app writes a strength (usually 1) into a field; the consumer inside
 * the frame loop picks it up on the next frame, zeroes it, and rings it
 * down through its own envelope. Mutable-ref plumbing keeps this allocation-
 * free and off the React render path, matching how metrics flow.
 */

import {
  advanceToNextCinematicShot,
  type CinematicState,
} from './dsp/cinematic';

export interface VisualImpulses {
  /** Living-palette hue jolt (same feel as an automatic drop kick). */
  hueKick: number;
  /** One-shot camera FOV punch-in. */
  camPunch: number;
  /** One-shot focus rack — blur thump. */
  dofPunch: number;
  /** One-shot bloom surge. */
  bloomPulse: number;
  /** Brief full-scene light flash. */
  flash: number;
  /** Bounded burst request for the active global emitter. */
  emitterBurst: number;
  /** Advance to the next authored shot when the camera is cinematic. */
  cinematicCut: number;
}

export function createImpulses(): VisualImpulses {
  return {
    hueKick: 0,
    camPunch: 0,
    dofPunch: 0,
    bloomPulse: 0,
    flash: 0,
    emitterBurst: 0,
    cinematicCut: 0,
  };
}

/**
 * Consume every cut request immediately. Non-cinematic cameras deliberately
 * discard it, so switching modes later cannot replay a stale queued cut.
 */
export function consumeCinematicCut(
  impulses: Pick<VisualImpulses, 'cinematicCut'>,
  cinematicMode: boolean,
  state: CinematicState,
): boolean {
  const request = impulses.cinematicCut;
  if (request === 0) return false;
  impulses.cinematicCut = 0;
  if (!Number.isFinite(request) || request <= 0 || !cinematicMode) return false;
  advanceToNextCinematicShot(state);
  return true;
}
