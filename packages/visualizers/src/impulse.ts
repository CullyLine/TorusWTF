/**
 * Visual impulses — one-shot commands fired INTO the scene from outside the
 * canvas (trigger mappings, MIDI notes, keyboard, projector sync).
 *
 * The app writes a strength (usually 1) into a field; the consumer inside
 * the frame loop picks it up on the next frame, zeroes it, and rings it
 * down through its own envelope. Mutable-ref plumbing keeps this allocation-
 * free and off the React render path, matching how metrics flow.
 */

export interface VisualImpulses {
  /** Living-palette hue jolt (same feel as an automatic drop kick). */
  hueKick: number;
  /** One-shot camera FOV punch-in. */
  camPunch: number;
  /** One-shot bloom surge. */
  bloomPulse: number;
  /** Brief full-scene light flash. */
  flash: number;
}

export function createImpulses(): VisualImpulses {
  return { hueKick: 0, camPunch: 0, bloomPulse: 0, flash: 0 };
}
