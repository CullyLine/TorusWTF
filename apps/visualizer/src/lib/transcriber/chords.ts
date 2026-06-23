import { Midi } from '@tonejs/midi';
import {
  DEFAULT_PRESET,
  PPQ,
  TRACK_COLORS,
  secondsToTicks,
  uid,
  type Clip,
  type ConductorProject,
  type Note,
  type Track,
} from '../conductor/project';
import type { Mode, PitchClass } from '@libraz/libsonare';
import { decodeToMono22k } from './transcribe';

/**
 * chords.ts — browser-side audio → chord progression, fully local (the file
 * never leaves the device, same as the note transcriber).
 *
 * Detection is delegated to libsonare (Apache-2.0, WASM): an NNLS chromagram
 * fed through a Viterbi/HMM decoder against a rich chord dictionary, with a
 * separate bass chromagram for inversions and a key-context bias. That gives us
 * 7th / 9th / sus / add / dim / half-dim chords plus slash-chord inversions —
 * the soul / future-bass palette — which a plain 12-bin template matcher can't
 * reach (a folded chroma throws away the bass register entirely).
 *
 * The 2.9 MB WASM binary is copied to /public/libsonare by a prefetch script
 * and fetched lazily on first use, so it never touches the initial bundle.
 */

const SR = 22050; // decodeToMono22k always returns this rate.

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

// Project/MIDI output is time-based; bpm only sets the tick grid.
const CHORD_BPM = 120;
const CHORD_BODY_MIDI = 48; // C3 — the chord body sits here.
const CHORD_BASS_MIDI = 36; // C2 — the detected bass / inversion note sits here.

/**
 * libsonare ChordQuality enum values (mirrored locally so we don't pull the
 * library's runtime exports into this module's static graph). Keep in sync with
 * `@libraz/libsonare` PitchClass(C=0) and ChordQuality.
 */
const QUALITY_INTERVALS: Record<number, number[]> = {
  0: [0, 4, 7], // Major
  1: [0, 3, 7], // Minor
  2: [0, 3, 6], // Diminished
  3: [0, 4, 8], // Augmented
  4: [0, 4, 7, 10], // Dominant7
  5: [0, 4, 7, 11], // Major7
  6: [0, 3, 7, 10], // Minor7
  7: [0, 2, 7], // Sus2
  8: [0, 5, 7], // Sus4
  9: [0, 4, 7], // Unknown (fallback; usually filtered out)
  10: [0, 4, 7, 14], // Add9
  11: [0, 3, 7, 14], // MinorAdd9
  12: [0, 3, 6, 9], // Dim7
  13: [0, 3, 6, 10], // HalfDim7
  14: [0, 4, 7, 11, 14], // Major9
  15: [0, 4, 7, 10, 14], // Dominant9
};

const QUALITY_SUFFIX: Record<number, string> = {
  0: '',
  1: 'm',
  2: 'dim',
  3: 'aug',
  4: '7',
  5: 'maj7',
  6: 'm7',
  7: 'sus2',
  8: 'sus4',
  9: '',
  10: 'add9',
  11: 'm(add9)',
  12: 'dim7',
  13: 'm7♭5',
  14: 'maj9',
  15: '9',
};

const UNKNOWN_QUALITY = 9;

export type ChordVoicing = 'block' | 'arp';

export interface ChordSegment {
  startSec: number;
  endSec: number;
  /** Display label, e.g. "Cmaj7", "Am7", "G/B". */
  label: string;
  rootPc: number; // 0..11 (C=0)
  bassPc: number; // 0..11 — lowest sounding pitch class (drives inversions)
  quality: number; // libsonare ChordQuality enum (0..15)
}

export type ChordPhase = 'decoding' | 'analyzing';

export interface ChordProgress {
  fraction: number;
  phase: ChordPhase;
}

export const CHORD_PHASE_LABELS: Record<ChordPhase, string> = {
  decoding: 'Decoding audio…',
  analyzing: 'Finding chords…',
};

function pc(n: number): number {
  return ((Math.round(n) % 12) + 12) % 12;
}

/** Build a human label when libsonare doesn't hand one back. */
function fallbackLabel(rootPc: number, bassPc: number, quality: number): string {
  const root = NOTE_NAMES[rootPc] ?? 'C';
  const suffix = QUALITY_SUFFIX[quality] ?? '';
  const base = `${root}${suffix}`;
  return bassPc !== rootPc ? `${base}/${NOTE_NAMES[bassPc] ?? ''}` : base;
}

/** Ensure inversions are visible in the label even if the engine omits them. */
function ensureSlash(label: string, rootPc: number, bassPc: number): string {
  if (bassPc === rootPc || label.includes('/')) return label;
  return `${label}/${NOTE_NAMES[bassPc] ?? ''}`;
}

// ---------------------------------------------------------------------------
// libsonare loader (lazy import + one-time WASM init from /public).
// ---------------------------------------------------------------------------

function importSonare() {
  return import('@libraz/libsonare');
}
type Sonare = Awaited<ReturnType<typeof importSonare>>;

let sonarePromise: Promise<Sonare> | null = null;

async function loadSonare(): Promise<Sonare> {
  if (!sonarePromise) {
    sonarePromise = (async () => {
      const mod = await importSonare();
      // Hand the engine its WASM bytes directly so emscripten never has to
      // resolve a path through the bundler (robust under Next.js/webpack).
      const res = await fetch('/libsonare/sonare.wasm');
      if (!res.ok) throw new Error(`Failed to load chord engine (HTTP ${res.status}).`);
      const wasmBinary = await res.arrayBuffer();
      await mod.init({ wasmBinary });
      return mod;
    })().catch((err) => {
      sonarePromise = null; // allow a retry on the next attempt
      throw err;
    });
  }
  return sonarePromise;
}

/** Detect a chord progression from an audio file (extended chords + inversions). */
export async function detectChords(
  file: File,
  onProgress?: (p: ChordProgress) => void,
): Promise<ChordSegment[]> {
  onProgress?.({ fraction: 0.02, phase: 'decoding' });
  const samples = await decodeToMono22k(file);

  onProgress?.({ fraction: 0.2, phase: 'decoding' });
  const sonare = await loadSonare();

  onProgress?.({ fraction: 0.45, phase: 'analyzing' });
  // Bias chord choices toward the song's key, so in-key extensions win.
  let keyRoot: PitchClass | undefined;
  let keyMode: Mode | undefined;
  try {
    const key = sonare.detectKey(samples, SR);
    keyRoot = key.root;
    keyMode = key.mode;
  } catch {
    // Key context is a nicety; fall back to no bias if it fails.
  }

  onProgress?.({ fraction: 0.6, phase: 'analyzing' });
  // Yield once so the "Finding chords…" UI can paint before the WASM crunch
  // (detectChords is synchronous and blocks the main thread briefly).
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  const result = sonare.detectChords(samples, SR, {
    chromaMethod: 'nnls', // high-quality chroma the classic MIR systems use
    useHmm: true, // Viterbi/HMM temporal smoothing (less flicker)
    detectInversions: true, // slash chords via the detected bass note
    useKeyContext: keyRoot !== undefined,
    keyRoot,
    keyMode,
    useBeatSync: true,
    minDuration: 0.5,
  });

  onProgress?.({ fraction: 0.95, phase: 'analyzing' });

  const segments: ChordSegment[] = [];
  for (const c of result.chords) {
    if (c.end <= c.start) continue;
    if (c.quality === UNKNOWN_QUALITY) continue; // "no clear chord" here
    const name = (c.name ?? '').trim();
    if (name === 'N' || name === 'NC') continue;
    const rootPc = pc(c.root);
    const bassPc = pc(c.bass);
    const base = name || fallbackLabel(rootPc, bassPc, c.quality);
    const label = ensureSlash(base, rootPc, bassPc);

    // Merge into the previous run if it's the same chord (engine may emit
    // adjacent identical segments across beats).
    const prev = segments[segments.length - 1];
    if (
      prev &&
      prev.rootPc === rootPc &&
      prev.bassPc === bassPc &&
      prev.quality === c.quality &&
      c.start - prev.endSec < 0.05
    ) {
      prev.endSec = c.end;
      continue;
    }

    segments.push({ startSec: c.start, endSec: c.end, label, rootPc, bassPc, quality: c.quality });
  }

  onProgress?.({ fraction: 1, phase: 'analyzing' });
  return segments;
}

/** MIDI pitches for a chord: the detected bass note, then the chord body. */
function chordPitches(seg: ChordSegment): number[] {
  const intervals = QUALITY_INTERVALS[seg.quality] ?? [0, 4, 7];
  const body = intervals.map((i) => CHORD_BODY_MIDI + seg.rootPc + i);
  const bass = CHORD_BASS_MIDI + seg.bassPc; // a register below the body
  return [bass, ...body];
}

interface RawNote {
  pitch: number;
  startSec: number;
  durationSec: number;
}

function segmentNotes(seg: ChordSegment, voicing: ChordVoicing): RawNote[] {
  const pitches = chordPitches(seg);
  const dur = Math.max(0.05, seg.endSec - seg.startSec);
  if (voicing === 'block') {
    return pitches.map((pitch) => ({ pitch, startSec: seg.startSec, durationSec: dur }));
  }
  // Arpeggio: ascending eighths (~0.25 s) repeating to fill the segment.
  const step = 0.25;
  const out: RawNote[] = [];
  let t = seg.startSec;
  let idx = 0;
  while (t < seg.endSec - 1e-3) {
    const pitch = pitches[idx % pitches.length]!;
    out.push({ pitch, startSec: t, durationSec: Math.min(step, seg.endSec - t) });
    t += step;
    idx++;
  }
  return out;
}

/** Build a single-track Conductor project from a chord progression. */
export function chordsToProject(
  segments: ChordSegment[],
  name: string,
  voicing: ChordVoicing = 'block',
): ConductorProject {
  const raw = segments.flatMap((s) => segmentNotes(s, voicing));
  const endSec = segments.reduce((m, s) => Math.max(m, s.endSec), 0);
  const lengthTick = Math.max(PPQ * 4, Math.ceil(secondsToTicks(endSec, CHORD_BPM, PPQ)));

  const notes: Note[] = raw.map((n) => ({
    id: uid('note'),
    startTick: Math.max(0, Math.round(secondsToTicks(n.startSec, CHORD_BPM, PPQ))),
    durationTick: Math.max(1, Math.round(secondsToTicks(n.durationSec, CHORD_BPM, PPQ))),
    pitch: n.pitch,
    velocity: 84,
  }));

  const clip: Clip = { id: uid('clp'), name: 'Chords', startTick: 0, lengthTick, notes };
  const track: Track = {
    id: uid('trk'),
    name: 'Chords',
    channel: 0,
    preset: { ...DEFAULT_PRESET },
    color: TRACK_COLORS[0]!,
    mute: false,
    solo: false,
    volume: 0.85,
    clips: [clip],
  };

  return {
    id: uid('prj'),
    name: name || 'Chords',
    bpm: CHORD_BPM,
    ppq: PPQ,
    key: { tonic: 0, scale: 'major' },
    scaleLock: false,
    tracks: [track],
  };
}

/** Build a standard .mid file (single chord track) from a progression. */
export function chordsToMidi(segments: ChordSegment[], voicing: ChordVoicing = 'block'): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(CHORD_BPM);
  const track = midi.addTrack();
  track.name = 'Chords';
  for (const seg of segments) {
    for (const n of segmentNotes(seg, voicing)) {
      track.addNote({
        midi: n.pitch,
        time: n.startSec,
        duration: Math.max(0.05, n.durationSec),
        velocity: 0.66,
      });
    }
  }
  return midi.toArray();
}
