/**
 * scales.ts — pure music-theory helpers for Conductor's scale lock + highlight.
 * No DOM, no React: trivially unit-testable (see scales.test.ts).
 *
 * Pitches are MIDI note numbers (C-1 = 0, middle C = 60). A "tonic" is a pitch
 * class 0..11 (C..B), so D# minor = { tonic: 3, scale: 'minor' }.
 */

export type ScaleId =
  | 'major'
  | 'minor'
  | 'harmonicMinor'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'locrian'
  | 'pentatonicMajor'
  | 'pentatonicMinor'
  | 'blues';

export interface KeyLock {
  tonic: number; // pitch class 0..11
  scale: ScaleId;
}

/** Semitone intervals from the tonic for each supported scale. */
export const SCALES: Record<ScaleId, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  pentatonicMajor: [0, 2, 4, 7, 9],
  pentatonicMinor: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
};

export const SCALE_LABELS: Record<ScaleId, string> = {
  major: 'Major',
  minor: 'Minor',
  harmonicMinor: 'Harmonic Minor',
  dorian: 'Dorian',
  phrygian: 'Phrygian',
  lydian: 'Lydian',
  mixolydian: 'Mixolydian',
  locrian: 'Locrian',
  pentatonicMajor: 'Pentatonic Major',
  pentatonicMinor: 'Pentatonic Minor',
  blues: 'Blues',
};

export const SCALE_IDS = Object.keys(SCALES) as ScaleId[];

export const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

/** True modulo that always returns 0..(m-1), unlike JS `%` for negatives. */
function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** Pitch class 0..11 of a MIDI pitch. */
export function pitchClass(pitch: number): number {
  return mod(pitch, 12);
}

export function isInScale(pitch: number, key: KeyLock): boolean {
  const degree = mod(pitch - key.tonic, 12);
  return SCALES[key.scale].includes(degree);
}

export function isTonic(pitch: number, key: KeyLock): boolean {
  return pitchClass(pitch) === mod(key.tonic, 12);
}

/** Scale degree index (0-based) of a pitch, or -1 if out of scale. */
export function scaleDegree(pitch: number, key: KeyLock): number {
  const degree = mod(pitch - key.tonic, 12);
  return SCALES[key.scale].indexOf(degree);
}

/**
 * Nearest in-scale pitch (used by the "Lock to scale" snap). Ties resolve
 * downward so snapping feels stable. Returns the pitch unchanged if already
 * in scale.
 */
export function nearestInScale(pitch: number, key: KeyLock): number {
  if (isInScale(pitch, key)) return pitch;
  for (let delta = 1; delta <= 6; delta++) {
    if (isInScale(pitch - delta, key)) return pitch - delta;
    if (isInScale(pitch + delta, key)) return pitch + delta;
  }
  return pitch;
}

/** Human note name with octave, e.g. 60 -> "C4". */
export function noteName(pitch: number): string {
  return `${NOTE_NAMES[pitchClass(pitch)]!}${Math.floor(pitch / 12) - 1}`;
}
