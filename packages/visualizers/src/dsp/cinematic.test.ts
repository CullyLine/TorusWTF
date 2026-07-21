import { describe, expect, it } from 'vitest';
import {
  advanceToNextCinematicShot,
  CINEMATIC_SHOTS,
  createCinematicState,
} from './cinematic';

function shotStart(index: number): number {
  let start = 0;
  for (let i = 0; i < index; i += 1) {
    start += CINEMATIC_SHOTS[i]!.beats;
  }
  return start;
}

describe('advanceToNextCinematicShot', () => {
  it('advances from within a shot to the next authored shot start', () => {
    const state = createCinematicState();
    state.beatsElapsed = CINEMATIC_SHOTS[0]!.beats / 2;

    advanceToNextCinematicShot(state);

    expect(state.beatsElapsed).toBe(shotStart(1));
  });

  it('advances past the current shot when already exactly on a boundary', () => {
    const state = createCinematicState();
    state.beatsElapsed = shotStart(1);

    advanceToNextCinematicShot(state);

    expect(state.beatsElapsed).toBe(shotStart(2));
  });

  it('wraps from the final shot to the first authored shot start', () => {
    const state = createCinematicState();
    const finalShotIndex = CINEMATIC_SHOTS.length - 1;
    state.beatsElapsed =
      shotStart(finalShotIndex) + CINEMATIC_SHOTS[finalShotIndex]!.beats / 2;

    advanceToNextCinematicShot(state);

    expect(state.beatsElapsed).toBe(shotStart(0));
  });
});
