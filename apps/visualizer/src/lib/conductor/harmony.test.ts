import { describe, expect, it } from 'vitest';
import { barChordNotes, rootPositionTriad } from './harmony';
import { isInScale, type KeyLock } from './scales';
import type { Clip, Note } from './project';

const C_MAJOR: KeyLock = { tonic: 0, scale: 'major' };
const TPB = 1920; // one 4/4 bar at PPQ 480

function note(startTick: number, durationTick: number, pitch: number): Note {
  return { id: `n-${startTick}-${pitch}`, startTick, durationTick, pitch, velocity: 100 };
}

function clip(notes: Note[], lengthTick: number): Clip {
  return { id: 'c', name: 'c', startTick: 0, lengthTick, notes };
}

describe('rootPositionTriad', () => {
  it('builds I (C E G near C3) from C in C major, octave-independent', () => {
    expect(rootPositionTriad(60, C_MAJOR)).toEqual([48, 52, 55]);
    expect(rootPositionTriad(72, C_MAJOR)).toEqual([48, 52, 55]);
    expect(rootPositionTriad(36, C_MAJOR)).toEqual([48, 52, 55]);
  });

  it('builds ii (D F A) from D in C major', () => {
    expect(rootPositionTriad(62, C_MAJOR)).toEqual([50, 53, 57]);
  });

  it('builds vii dim (B D F) from the leading tone', () => {
    expect(rootPositionTriad(71, C_MAJOR)).toEqual([47, 50, 53]);
  });

  it('snaps out-of-scale melody notes into the key first', () => {
    // C# is out of C major; snaps to C -> I chord.
    expect(rootPositionTriad(61, C_MAJOR)).toEqual([48, 52, 55]);
  });

  it('always voices within MIDI range and in the key', () => {
    for (let p = 24; p <= 96; p++) {
      const triad = rootPositionTriad(p, C_MAJOR);
      expect(triad).toHaveLength(3);
      for (const n of triad) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(127);
        expect(isInScale(n, C_MAJOR)).toBe(true);
      }
    }
  });
});

describe('barChordNotes', () => {
  it('emits one triad per bar that has notes, skipping empty bars', () => {
    const c = clip([note(0, 480, 60), note(2 * TPB, 480, 62)], 3 * TPB);
    const chords = barChordNotes(c, C_MAJOR, TPB);
    // bar 0 -> C triad (3 notes), bar 1 empty (0), bar 2 -> D triad (3 notes)
    expect(chords).toHaveLength(6);
    expect(chords.filter((n) => n.startTick === 0)).toHaveLength(3);
    expect(chords.filter((n) => n.startTick === 2 * TPB)).toHaveLength(3);
    expect(chords.some((n) => n.startTick === TPB)).toBe(false);
  });

  it('picks the longest (most prominent) note in a bar as the chord root source', () => {
    // short C then long D in bar 0 -> D triad expected
    const c = clip([note(0, 240, 60), note(480, 1200, 62)], TPB);
    const chords = barChordNotes(c, C_MAJOR, TPB);
    expect(chords.map((n) => n.pitch)).toEqual([50, 53, 57]);
  });

  it('clamps the final chord duration to the clip length', () => {
    const c = clip([note(0, 240, 60)], TPB / 2);
    const chords = barChordNotes(c, C_MAJOR, TPB);
    expect(chords).toHaveLength(3);
    for (const n of chords) expect(n.durationTick).toBe(TPB / 2);
  });
});
