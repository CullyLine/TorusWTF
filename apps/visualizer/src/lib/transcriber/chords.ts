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
import { decodeToMono22k } from './transcribe';

/**
 * chords.ts — browser-side audio → chord progression, fully local (the file
 * never leaves the device, same as the note transcriber).
 *
 * Pipeline (a lightweight take on the classic HPCP → chord-template approach):
 *   decode → frame → Hann window → FFT magnitude → fold bins into a 12-bin
 *   chroma → aggregate into ~0.4 s blocks → match each block against the 24
 *   major/minor triad templates → smooth + merge into timed chord segments.
 *
 * We roll our own DSP rather than depending on a multi-megabyte WASM MIR lib:
 * it keeps the bundle lean and avoids fragile WASM bundling, while staying
 * 100% client-side.
 */

const SR = 22050; // decodeToMono22k always returns this rate
const FRAME = 4096;
const HOP = 2048;
const HALF = FRAME / 2;
const HOP_SEC = HOP / SR;

// Chroma binning range — roughly A1..C7 covers chordal content without the
// extreme lows (rumble) or highs (cymbals/air) that just muddy the profile.
const MIN_FREQ = 55;
const MAX_FREQ = 2093;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

// Block-level smoothing: shortest chord we'll keep, in seconds.
const MIN_SEG_SEC = 0.5;
const BLOCK_SEC = 0.4;

// Project/MIDI output is time-based; bpm only sets the tick grid.
const CHORD_BPM = 120;
const CHORD_ROOT_MIDI = 48; // C3 — comfortable mid-range voicing

export type ChordQuality = 'maj' | 'min';
export type ChordVoicing = 'block' | 'arp';

export interface ChordSegment {
  startSec: number;
  endSec: number;
  /** Display label, e.g. "C" (major) or "Am" (minor). */
  label: string;
  rootPc: number; // 0..11
  quality: ChordQuality;
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

/** In-place iterative radix-2 Cooley–Tukey FFT (FRAME is a power of two). */
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wpr = Math.cos(ang);
    const wpi = Math.sin(ang);
    const halfLen = len >> 1;
    for (let i = 0; i < n; i += len) {
      let wr = 1;
      let wi = 0;
      for (let k = 0; k < halfLen; k++) {
        const a = i + k;
        const b = a + halfLen;
        const rea = re[a]!;
        const ima = im[a]!;
        const reb = re[b]!;
        const imb = im[b]!;
        const xr = reb * wr - imb * wi;
        const xi = reb * wi + imb * wr;
        re[b] = rea - xr;
        im[b] = ima - xi;
        re[a] = rea + xr;
        im[a] = ima + xi;
        const tmp = wr;
        wr = wr * wpr - wi * wpi;
        wi = tmp * wpi + wi * wpr;
      }
    }
  }
}

// Precomputed per-bin pitch class (-1 = outside the chroma range) and window.
const BIN_PC = (() => {
  const pcs = new Int8Array(HALF + 1).fill(-1);
  for (let k = 1; k <= HALF; k++) {
    const freq = (k * SR) / FRAME;
    if (freq < MIN_FREQ || freq > MAX_FREQ) continue;
    let pc = Math.round(69 + 12 * Math.log2(freq / 440)) % 12;
    if (pc < 0) pc += 12;
    pcs[k] = pc;
  }
  return pcs;
})();

const HANN = (() => {
  const w = new Float32Array(FRAME);
  for (let i = 0; i < FRAME; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1));
  return w;
})();

/** Best-matching triad for a chroma vector. Returns 0..11 (major), 12..23 (minor), or -1. */
function classify(chroma: Float32Array): number {
  let norm = 0;
  for (let p = 0; p < 12; p++) {
    const v = chroma[p]!;
    norm += v * v;
  }
  if (Math.sqrt(norm) <= 1e-9) return -1;

  let best = -1;
  let bestScore = -Infinity;
  for (let root = 0; root < 12; root++) {
    const r = chroma[root]!;
    const fifth = chroma[(root + 7) % 12]!;
    const sMaj = r + chroma[(root + 4) % 12]! + fifth;
    if (sMaj > bestScore) {
      bestScore = sMaj;
      best = root;
    }
    const sMin = r + chroma[(root + 3) % 12]! + fifth;
    if (sMin > bestScore) {
      bestScore = sMin;
      best = root + 12;
    }
  }
  return best;
}

function labelFor(index: number): { label: string; rootPc: number; quality: ChordQuality } {
  const minor = index >= 12;
  const rootPc = minor ? index - 12 : index;
  const name = NOTE_NAMES[rootPc]!;
  return { label: minor ? `${name}m` : name, rootPc, quality: minor ? 'min' : 'maj' };
}

/** Detect a chord progression from an audio file. */
export async function detectChords(
  file: File,
  onProgress?: (p: ChordProgress) => void,
): Promise<ChordSegment[]> {
  onProgress?.({ fraction: 0.02, phase: 'decoding' });
  const samples = await decodeToMono22k(file);
  onProgress?.({ fraction: 0.1, phase: 'analyzing' });

  const nFrames = samples.length >= FRAME ? Math.floor((samples.length - FRAME) / HOP) + 1 : 0;
  if (nFrames === 0) return [];

  // Per-frame chroma + raw energy.
  const re = new Float32Array(FRAME);
  const im = new Float32Array(FRAME);
  const chromas: Float32Array[] = [];
  const energies = new Float32Array(nFrames);

  for (let f = 0; f < nFrames; f++) {
    const off = f * HOP;
    im.fill(0);
    for (let i = 0; i < FRAME; i++) re[i] = samples[off + i]! * HANN[i]!;
    fft(re, im);

    const chroma = new Float32Array(12);
    let energy = 0;
    for (let k = 1; k <= HALF; k++) {
      const pc = BIN_PC[k]!;
      if (pc < 0) continue;
      const reK = re[k]!;
      const imK = im[k]!;
      const mag = Math.sqrt(reK * reK + imK * imK);
      chroma[pc] = chroma[pc]! + mag;
      energy += mag;
    }
    energies[f] = energy;

    let mx = 0;
    for (let p = 0; p < 12; p++) {
      const v = chroma[p]!;
      if (v > mx) mx = v;
    }
    if (mx > 0) for (let p = 0; p < 12; p++) chroma[p] = chroma[p]! / mx;
    chromas.push(chroma);

    if ((f & 31) === 0) {
      // Reserve the last 10% for segmentation.
      onProgress?.({ fraction: 0.1 + 0.8 * (f / nFrames), phase: 'analyzing' });
    }
  }

  // Aggregate frames into blocks and classify each.
  const blockFrames = Math.max(1, Math.round(BLOCK_SEC / HOP_SEC));
  const nBlocks = Math.ceil(nFrames / blockFrames);
  const labels = new Int16Array(nBlocks);
  const blockEnergy = new Float32Array(nBlocks);
  let maxEnergy = 0;

  for (let b = 0; b < nBlocks; b++) {
    const start = b * blockFrames;
    const end = Math.min(nFrames, start + blockFrames);
    const acc = new Float32Array(12);
    let eSum = 0;
    for (let f = start; f < end; f++) {
      const c = chromas[f]!;
      for (let p = 0; p < 12; p++) acc[p] = acc[p]! + c[p]!;
      eSum += energies[f]!;
    }
    blockEnergy[b] = eSum;
    if (eSum > maxEnergy) maxEnergy = eSum;
    labels[b] = classify(acc);
  }

  // Gate out near-silent blocks (intros, gaps) so they don't get a chord.
  const gate = maxEnergy * 0.08;
  for (let b = 0; b < nBlocks; b++) if (blockEnergy[b]! < gate) labels[b] = -1;

  // Majority smoothing over a 3-block window to kill single-block flicker.
  const smoothed = new Int16Array(nBlocks);
  for (let b = 0; b < nBlocks; b++) {
    const counts = new Map<number, number>();
    for (let d = -1; d <= 1; d++) {
      const idx = b + d;
      if (idx < 0 || idx >= nBlocks) continue;
      const lab = labels[idx]!;
      counts.set(lab, (counts.get(lab) ?? 0) + 1);
    }
    let bestLab = labels[b]!;
    let bestCount = -1;
    for (const [lab, count] of counts) {
      if (count > bestCount) {
        bestCount = count;
        bestLab = lab;
      }
    }
    smoothed[b] = bestLab;
  }

  // Enforce a minimum run length (relabel short runs to the previous chord).
  const minBlocks = Math.max(1, Math.round(MIN_SEG_SEC / (blockFrames * HOP_SEC)));
  let i = 0;
  while (i < nBlocks) {
    let j = i;
    while (j < nBlocks && smoothed[j] === smoothed[i]) j++;
    if (j - i < minBlocks && i > 0) {
      const prev = smoothed[i - 1]!;
      for (let k = i; k < j; k++) smoothed[k] = prev;
    } else {
      i = j;
    }
  }

  // Merge equal runs into timed segments (skipping the "no chord" label).
  const segments: ChordSegment[] = [];
  let b = 0;
  while (b < nBlocks) {
    const lab = smoothed[b]!;
    let e = b;
    while (e < nBlocks && smoothed[e] === lab) e++;
    if (lab >= 0) {
      const startSec = b * blockFrames * HOP_SEC;
      const endSec = Math.min(nFrames, e * blockFrames) * HOP_SEC + FRAME / SR;
      segments.push({ startSec, endSec, ...labelFor(lab) });
    }
    b = e;
  }

  onProgress?.({ fraction: 1, phase: 'analyzing' });
  return segments;
}

/** MIDI pitches for a chord: root, third, fifth, and the octave root on top. */
function chordPitches(rootPc: number, quality: ChordQuality): number[] {
  const root = CHORD_ROOT_MIDI + rootPc;
  const third = root + (quality === 'min' ? 3 : 4);
  return [root, third, root + 7, root + 12];
}

interface RawNote {
  pitch: number;
  startSec: number;
  durationSec: number;
}

function segmentNotes(seg: ChordSegment, voicing: ChordVoicing): RawNote[] {
  const pitches = chordPitches(seg.rootPc, seg.quality);
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
