import { describe, expect, it } from 'vitest';
import { CINEMATIC_SHOTS, createCinematicState } from './dsp/cinematic';
import { consumeCinematicCut, createImpulses } from './impulse';

describe('cinematic cut impulses', () => {
  it('consumes and discards requests outside cinematic mode', () => {
    const impulses = createImpulses();
    const state = createCinematicState();
    state.beatsElapsed = 2;
    impulses.cinematicCut = 1;

    expect(consumeCinematicCut(impulses, false, state)).toBe(false);
    expect(impulses.cinematicCut).toBe(0);
    expect(state.beatsElapsed).toBe(2);

    // Entering cinematic later must not replay the discarded request.
    expect(consumeCinematicCut(impulses, true, state)).toBe(false);
    expect(state.beatsElapsed).toBe(2);
  });

  it('clears malformed or non-positive requests without advancing', () => {
    const impulses = createImpulses();
    const state = createCinematicState();
    state.beatsElapsed = 3;

    for (const request of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      impulses.cinematicCut = request;
      expect(consumeCinematicCut(impulses, true, state)).toBe(false);
      expect(impulses.cinematicCut).toBe(0);
      expect(state.beatsElapsed).toBe(3);
    }
  });

  it('advances exactly once for each request in cinematic mode', () => {
    const impulses = createImpulses();
    const state = createCinematicState();
    impulses.cinematicCut = 0.5;

    expect(consumeCinematicCut(impulses, true, state)).toBe(true);
    expect(impulses.cinematicCut).toBe(0);
    expect(state.beatsElapsed).toBe(CINEMATIC_SHOTS[0]!.beats);

    expect(consumeCinematicCut(impulses, true, state)).toBe(false);
    expect(state.beatsElapsed).toBe(CINEMATIC_SHOTS[0]!.beats);
  });
});
