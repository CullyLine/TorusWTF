import { describe, expect, it } from 'vitest';
import {
  isInScale,
  isTonic,
  nearestInScale,
  noteName,
  pitchClass,
  scaleDegree,
  SCALES,
  type KeyLock,
} from './scales';

const C_MAJOR: KeyLock = { tonic: 0, scale: 'major' };
const DSHARP_MINOR: KeyLock = { tonic: 3, scale: 'minor' };

describe('pitchClass', () => {
  it('wraps into 0..11, including negatives', () => {
    expect(pitchClass(60)).toBe(0);
    expect(pitchClass(61)).toBe(1);
    expect(pitchClass(-1)).toBe(11);
    expect(pitchClass(13)).toBe(1);
  });
});

describe('isInScale', () => {
  it('matches the C major scale across octaves', () => {
    // C D E F G A B
    expect(isInScale(60, C_MAJOR)).toBe(true);
    expect(isInScale(62, C_MAJOR)).toBe(true);
    expect(isInScale(71, C_MAJOR)).toBe(true);
    // C# / Eb are out
    expect(isInScale(61, C_MAJOR)).toBe(false);
    expect(isInScale(63, C_MAJOR)).toBe(false);
    // an octave up behaves identically
    expect(isInScale(72, C_MAJOR)).toBe(true);
  });

  it('matches D# minor (the user example)', () => {
    // D# F F# G# A# B C#
    for (const pc of [3, 5, 6, 8, 10, 11, 1]) {
      expect(isInScale(pc, DSHARP_MINOR)).toBe(true);
    }
    expect(isInScale(4, DSHARP_MINOR)).toBe(false); // E
    expect(isInScale(0, DSHARP_MINOR)).toBe(false); // C
  });
});

describe('isTonic', () => {
  it('is true only for the tonic pitch class', () => {
    expect(isTonic(3, DSHARP_MINOR)).toBe(true);
    expect(isTonic(15, DSHARP_MINOR)).toBe(true);
    expect(isTonic(4, DSHARP_MINOR)).toBe(false);
    expect(isTonic(60, C_MAJOR)).toBe(true);
  });
});

describe('scaleDegree', () => {
  it('returns 0-based degree or -1 when out of scale', () => {
    expect(scaleDegree(3, DSHARP_MINOR)).toBe(0);
    expect(scaleDegree(5, DSHARP_MINOR)).toBe(1);
    expect(scaleDegree(4, DSHARP_MINOR)).toBe(-1);
  });
});

describe('nearestInScale', () => {
  it('returns the pitch unchanged when already in scale', () => {
    expect(nearestInScale(3, DSHARP_MINOR)).toBe(3);
    expect(nearestInScale(60, C_MAJOR)).toBe(60);
  });

  it('snaps out-of-scale pitches to an in-scale neighbor within 6 semitones', () => {
    const snapped = nearestInScale(61, C_MAJOR);
    expect(isInScale(snapped, C_MAJOR)).toBe(true);
    expect(Math.abs(snapped - 61)).toBeLessThanOrEqual(6);
    // E (4) is out of D# minor; nearest is D# (3) by the downward tie rule
    expect(nearestInScale(4, DSHARP_MINOR)).toBe(3);
  });

  it('always lands on an in-scale pitch for every input', () => {
    for (let p = 24; p <= 96; p++) {
      expect(isInScale(nearestInScale(p, DSHARP_MINOR), DSHARP_MINOR)).toBe(true);
    }
  });
});

describe('noteName', () => {
  it('formats name + octave', () => {
    expect(noteName(60)).toBe('C4');
    expect(noteName(61)).toBe('C#4');
    expect(noteName(57)).toBe('A3');
  });
});

describe('SCALES table', () => {
  it('has 7 notes for diatonic modes and starts on the tonic', () => {
    for (const intervals of Object.values(SCALES)) {
      expect(intervals[0]).toBe(0);
      expect(intervals.every((n) => n >= 0 && n < 12)).toBe(true);
    }
    expect(SCALES.major).toHaveLength(7);
    expect(SCALES.pentatonicMinor).toHaveLength(5);
  });
});
