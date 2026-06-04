import { nearestInScale, scaleDegree, SCALES, type KeyLock } from './scales';
import type { Clip, Note } from './project';

/**
 * harmony.ts — pure helpers for generating diatonic chords from a melody.
 * No DOM/React: unit-tested in harmony.test.ts.
 *
 * Strategy (per the plan): one chord per bar, built from the bar's most
 * prominent melody note, voiced as a root-position diatonic triad in a fixed
 * register around C3 (MIDI 48) regardless of the melody's octave.
 */

const C3 = 48;

/**
 * Builds a root-position diatonic triad (stacked thirds within the key) from a
 * melody note, voiced near `baseMidi`. The melody note is first snapped into
 * the key so out-of-scale input still yields a sensible chord.
 */
export function rootPositionTriad(melodyPitch: number, key: KeyLock, baseMidi = C3): number[] {
  const intervals = SCALES[key.scale];
  const len = intervals.length;
  const snapped = nearestInScale(melodyPitch, key);
  const degIdx = Math.max(0, scaleDegree(snapped, key));

  // Absolute semitone offsets from the tonic for the 1st, 3rd and 5th scale
  // tones above the chord root (wrapping octaves as the index passes `len`).
  const offsetsFromTonic = [0, 2, 4].map((step) => {
    const idx = degIdx + step;
    return intervals[idx % len]! + 12 * Math.floor(idx / len);
  });

  const rootPc = ((key.tonic + offsetsFromTonic[0]!) % 12 + 12) % 12;
  const root = rootPc + 12 * Math.round((baseMidi - rootPc) / 12);

  return offsetsFromTonic.map((off) => {
    const pitch = root + (off - offsetsFromTonic[0]!);
    return Math.max(0, Math.min(127, pitch));
  });
}

/**
 * Generates chord notes (one root-position triad per bar) for a clip's melody.
 * Returns notes relative to the clip start, ready to drop into a new clip.
 */
export function barChordNotes(clip: Clip, key: KeyLock, ticksPerBar: number): Omit<Note, 'id'>[] {
  const bars = Math.max(1, Math.ceil(clip.lengthTick / ticksPerBar));
  const out: Omit<Note, 'id'>[] = [];

  for (let b = 0; b < bars; b++) {
    const barStart = b * ticksPerBar;
    const barEnd = barStart + ticksPerBar;
    const inBar = clip.notes.filter((n) => n.startTick >= barStart && n.startTick < barEnd);
    if (inBar.length === 0) continue;

    // Most prominent = longest note; tie-break earliest, then highest.
    const lead = inBar
      .slice()
      .sort(
        (a, z) =>
          z.durationTick - a.durationTick || a.startTick - z.startTick || z.pitch - a.pitch,
      )[0]!;

    const durationTick = Math.min(ticksPerBar, clip.lengthTick - barStart);
    for (const pitch of rootPositionTriad(lead.pitch, key)) {
      out.push({ startTick: barStart, durationTick, pitch, velocity: 90 });
    }
  }

  return out;
}
