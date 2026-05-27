/**
 * Anima — the always-living layer.
 *
 * Three drivers that run regardless of audio:
 *  - heartbeat: slow 3-5 second sine that gives the scene a subtle breath
 *  - drift:     sub-degree Perlin-noise camera micro-rotations
 *  - shimmer:   minute-scale random walk that subtly tints palette warmth
 *
 * Audio modulates these drivers; it does not cause them. The creature is
 * always breathing.
 */

import type { CreaturePersonality } from './creature';

export interface AnimaState {
  /** -1..1 slow sine (0.06-0.12Hz). Drives breath-like scene scale pulse. */
  heartbeat: number;
  /** Slow Perlin-style yaw drift in radians (~0.5 deg max). */
  driftYaw: number;
  /** Slow Perlin-style pitch drift in radians (~0.3 deg max). */
  driftPitch: number;
  /** 0..1 random walk that subtly tints scene warmth over minutes. */
  shimmer: number;
}

export const NEUTRAL_ANIMA: AnimaState = {
  heartbeat: 0,
  driftYaw: 0,
  driftPitch: 0,
  shimmer: 0.5,
};

/**
 * Smooth pseudo-Perlin via summed sines at irrational frequency ratios.
 * Returns a value in [-1, 1] that drifts continuously without harmonic seams.
 */
function smoothNoise(t: number, seed: number): number {
  const a = Math.sin(t * 0.073 + seed * 1.713);
  const b = Math.sin(t * 0.041 + seed * 2.317) * 0.6;
  const c = Math.sin(t * 0.117 + seed * 0.531) * 0.3;
  return (a + b + c) / 1.9;
}

/**
 * Update the anima state in-place. Called every frame from SceneRig.
 *
 * `personality` (from the hidden creature) biases heartbeat tempo:
 *  - personality.tempoBias > 0 → slightly faster heartbeat
 *  - personality.tempoBias < 0 → slightly slower heartbeat
 * Bias is ±20% max, never enough to break the "alive" feel.
 */
export function updateAnima(
  out: AnimaState,
  elapsedSec: number,
  personality?: CreaturePersonality,
): void {
  // Heartbeat: base 0.09Hz (~11s cycle), biased ±20% by creature tempo.
  const tempoBias = personality?.tempoBias ?? 0;
  const hbFreq = 0.09 * (1 + tempoBias * 0.2);
  out.heartbeat = Math.sin(elapsedSec * hbFreq * 2 * Math.PI);

  // Drift: max ~0.5 deg yaw, ~0.3 deg pitch. Different seeds so they decorrelate.
  out.driftYaw = smoothNoise(elapsedSec, 1) * (0.5 * Math.PI / 180);
  out.driftPitch = smoothNoise(elapsedSec, 7) * (0.3 * Math.PI / 180);

  // Shimmer: extremely slow walk over [0, 1]. Centered at 0.5.
  out.shimmer = 0.5 + smoothNoise(elapsedSec * 0.05, 13) * 0.5;
}
