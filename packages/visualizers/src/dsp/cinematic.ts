/**
 * Cinematic camera — beat-locked authored shot sequence.
 *
 * The camera flies through a fixed list of "shots", each lasting a whole
 * number of beats. Shot transitions happen on beat boundaries so the cuts
 * feel musical regardless of tempo. The Speed slider scales how many
 * actual beats each shot occupies (speed=2 means a 4-beat shot lasts 2
 * beats, speed=0.5 means it lasts 8 beats).
 *
 * When no BPM is detected yet, falls back to 120 BPM internal clock.
 */

import * as THREE from 'three';

interface Pose {
  pos: [number, number, number];
  look: [number, number, number];
}

export interface Shot {
  name: string;
  /** Number of beats this shot lasts at speed=1. */
  beats: number;
  from: Pose;
  to: Pose;
  /** Easing applied to t (0..1). Default smoothstep. */
  ease?: (t: number) => number;
}

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function easeInOutCubic(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

function linear(t: number): number {
  return Math.max(0, Math.min(1, t));
}

/**
 * The authored shot sequence. Tuned so the camera always frames the
 * origin (where every preset is anchored) while constantly changing angle
 * and distance. Beat lengths sum to roughly 80 beats so the cycle takes
 * ~40 seconds at 120 BPM before repeating.
 */
export const CINEMATIC_SHOTS: Shot[] = [
  {
    name: 'slow-push-in',
    beats: 8,
    from: { pos: [0, 0, 6], look: [0, 0, 0] },
    to: { pos: [0, 0, 3.2], look: [0, 0, 0] },
    ease: easeInOutCubic,
  },
  {
    name: 'low-orbit-right',
    beats: 8,
    from: { pos: [3.2, -0.4, 1.6], look: [0, 0, 0] },
    to: { pos: [-1.0, -0.4, 3.4], look: [0, 0, 0] },
    ease: linear,
  },
  {
    name: 'top-down-sweep',
    beats: 6,
    from: { pos: [-1.8, 3.0, 1.2], look: [0, 0, 0] },
    to: { pos: [1.8, 3.0, 1.2], look: [0, 0, 0] },
    ease: smoothstep,
  },
  {
    name: 'side-pan-left',
    beats: 4,
    from: { pos: [-3.6, 0.2, 0.6], look: [0.4, 0, 0] },
    to: { pos: [-3.2, 0.2, 2.4], look: [-0.2, 0, 0] },
    ease: smoothstep,
  },
  {
    name: 'pull-back-reveal',
    beats: 12,
    from: { pos: [0.2, 0.3, 1.8], look: [0, 0, 0] },
    to: { pos: [0.2, 0.6, 6.5], look: [0, 0, 0] },
    ease: easeInOutCubic,
  },
  {
    name: 'roll-around-axis',
    beats: 8,
    from: { pos: [2.4, 0, 3.0], look: [0, 0, 0] },
    to: { pos: [-2.4, 0, 3.0], look: [0, 0, 0] },
    ease: linear,
  },
  {
    name: 'push-through-zero',
    beats: 6,
    from: { pos: [0, 0, 5.0], look: [0, 0, 0] },
    to: { pos: [0, 0, -0.6], look: [0, 0, -1] },
    ease: easeInOutCubic,
  },
  {
    name: 'lateral-arc',
    beats: 10,
    from: { pos: [-2.8, 1.2, 2.0], look: [0, 0, 0] },
    to: { pos: [2.8, -0.8, 2.0], look: [0, 0, 0] },
    ease: smoothstep,
  },
  {
    name: 'rise-from-floor',
    beats: 8,
    from: { pos: [0, -2.6, 2.6], look: [0, 0.4, 0] },
    to: { pos: [0, 1.8, 3.4], look: [0, -0.2, 0] },
    ease: easeInOutCubic,
  },
  {
    name: 'slow-zoom-out',
    beats: 10,
    from: { pos: [0, 0, 2.4], look: [0, 0, 0] },
    to: { pos: [0, 0, 5.6], look: [0, 0, 0] },
    ease: easeInOutCubic,
  },
];

export interface CinematicState {
  /** Total elapsed time within the cinematic loop (in beats, at speed=1). */
  beatsElapsed: number;
  /** Last wall-clock timestamp in seconds. Used to compute deltas. */
  lastTimeSec: number;
  /** Cached output pose, written each call to avoid allocations. */
  outPos: THREE.Vector3;
  outLook: THREE.Vector3;
}

export function createCinematicState(): CinematicState {
  return {
    beatsElapsed: 0,
    lastTimeSec: 0,
    outPos: new THREE.Vector3(0, 0, 4),
    outLook: new THREE.Vector3(0, 0, 0),
  };
}

const FALLBACK_BPM = 120;

/**
 * Advance the cinematic state by the time since the last call and write
 * the camera pose for this frame. The shot index advances purely from
 * beats-elapsed so transitions land on the same beats regardless of
 * frame rate.
 */
export function updateCinematicCamera(
  state: CinematicState,
  nowSec: number,
  bpm: number | null,
  speed: number,
): { pos: THREE.Vector3; look: THREE.Vector3 } {
  // First frame after construction: just snapshot the timestamp.
  if (state.lastTimeSec === 0) {
    state.lastTimeSec = nowSec;
  }
  const dtSec = Math.max(0, Math.min(0.25, nowSec - state.lastTimeSec));
  state.lastTimeSec = nowSec;

  const effectiveBpm = bpm && bpm > 30 ? bpm : FALLBACK_BPM;
  const beatsPerSec = effectiveBpm / 60;
  // speed > 1 makes shots advance faster (more "beats elapsed" per second).
  state.beatsElapsed += dtSec * beatsPerSec * Math.max(0.05, speed);

  // Total beats in one full cycle through the shot list.
  let cycleBeats = 0;
  for (const shot of CINEMATIC_SHOTS) cycleBeats += shot.beats;

  // Wrap the cursor inside the current cycle.
  const cursor = state.beatsElapsed % cycleBeats;

  // Locate which shot we're inside and the local progress 0..1.
  let acc = 0;
  let activeShot = CINEMATIC_SHOTS[0]!;
  let localT = 0;
  for (const shot of CINEMATIC_SHOTS) {
    if (cursor < acc + shot.beats) {
      activeShot = shot;
      localT = (cursor - acc) / shot.beats;
      break;
    }
    acc += shot.beats;
  }

  const ease = activeShot.ease ?? smoothstep;
  const eased = ease(localT);

  const fp = activeShot.from.pos;
  const tp = activeShot.to.pos;
  const fl = activeShot.from.look;
  const tl = activeShot.to.look;

  state.outPos.set(
    fp[0] + (tp[0] - fp[0]) * eased,
    fp[1] + (tp[1] - fp[1]) * eased,
    fp[2] + (tp[2] - fp[2]) * eased,
  );
  state.outLook.set(
    fl[0] + (tl[0] - fl[0]) * eased,
    fl[1] + (tl[1] - fl[1]) * eased,
    fl[2] + (tl[2] - fl[2]) * eased,
  );

  return { pos: state.outPos, look: state.outLook };
}
