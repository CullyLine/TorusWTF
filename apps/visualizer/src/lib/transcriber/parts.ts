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
import type { NoteEventTime } from './transcribe';

/**
 * parts.ts — pure helpers that turn Basic Pitch note events into a Conductor
 * project (for preview / "Send to Conductor") and into a standard .mid file
 * (for download). Grouping into "parts" happens once and is shared by both so
 * the preview, the handoff and the download always agree.
 */

export type SplitMode = 'none' | 'range';

export interface NotePart {
  name: string;
  notes: NoteEventTime[];
}

// Pitch-range boundaries for the lightweight (client-side) instrument split.
const BASS_MAX = 47; // below C3
const LEAD_MIN = 72; // C5 and up

export function splitNotes(notes: NoteEventTime[], mode: SplitMode): NotePart[] {
  if (mode === 'none' || notes.length === 0) {
    return [{ name: 'Transcription', notes }];
  }
  const bass: NoteEventTime[] = [];
  const mid: NoteEventTime[] = [];
  const lead: NoteEventTime[] = [];
  for (const n of notes) {
    if (n.pitchMidi <= BASS_MAX) bass.push(n);
    else if (n.pitchMidi >= LEAD_MIN) lead.push(n);
    else mid.push(n);
  }
  return [
    { name: 'Bass', notes: bass },
    { name: 'Mid', notes: mid },
    { name: 'Lead', notes: lead },
  ].filter((p) => p.notes.length > 0);
}

function velocityFromAmplitude(amplitude: number): number {
  const clamped = Math.max(0, Math.min(1, amplitude));
  return Math.max(1, Math.min(127, Math.round(clamped * 127)));
}

/** Longest note end (in ticks) across every part, for aligned clip lengths. */
function songLengthTicks(parts: NotePart[], bpm: number): number {
  let maxSec = 0;
  for (const part of parts) {
    for (const n of part.notes) {
      maxSec = Math.max(maxSec, n.startTimeSeconds + n.durationSeconds);
    }
  }
  const ticks = Math.ceil(secondsToTicks(maxSec, bpm, PPQ));
  return Math.max(PPQ * 4, ticks);
}

export interface ToProjectOptions {
  bpm: number;
  name: string;
}

export function partsToProject(parts: NotePart[], options: ToProjectOptions): ConductorProject {
  const { bpm, name } = options;
  const lengthTick = songLengthTicks(parts, bpm);

  const tracks: Track[] = parts.map((part, index) => {
    const notes: Note[] = part.notes.map((n) => {
      const startTick = Math.max(0, Math.round(secondsToTicks(n.startTimeSeconds, bpm, PPQ)));
      const durationTick = Math.max(1, Math.round(secondsToTicks(n.durationSeconds, bpm, PPQ)));
      return {
        id: uid('note'),
        startTick,
        durationTick,
        pitch: n.pitchMidi,
        velocity: velocityFromAmplitude(n.amplitude),
      };
    });
    const clip: Clip = {
      id: uid('clp'),
      name: part.name,
      startTick: 0,
      lengthTick,
      notes,
    };
    return {
      id: uid('trk'),
      name: part.name,
      channel: index % 16,
      preset: { ...DEFAULT_PRESET },
      color: TRACK_COLORS[index % TRACK_COLORS.length]!,
      mute: false,
      solo: false,
      volume: 0.85,
      clips: [clip],
    };
  });

  return {
    id: uid('prj'),
    name: name || 'Transcription',
    bpm,
    ppq: PPQ,
    key: { tonic: 0, scale: 'major' },
    scaleLock: false,
    tracks: tracks.length > 0 ? tracks : [],
  };
}

/** Build a standard multi-track MIDI file (one track per part). */
export function partsToMidi(parts: NotePart[], bpm: number): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(bpm);
  for (const part of parts) {
    const track = midi.addTrack();
    track.name = part.name;
    for (const n of part.notes) {
      track.addNote({
        midi: n.pitchMidi,
        time: n.startTimeSeconds,
        duration: Math.max(0.01, n.durationSeconds),
        velocity: Math.max(0, Math.min(1, n.amplitude)),
      });
    }
  }
  return midi.toArray();
}
