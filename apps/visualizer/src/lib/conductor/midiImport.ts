import { BasicMIDI, type MIDIMessage } from 'spessasynth_core';
import { DEFAULT_SOUNDFONT_ID } from './engine';
import {
  createTrack,
  MAX_TRACKS,
  PPQ,
  TRACK_COLORS,
  uid,
  type Clip,
  type ConductorProject,
  type Note,
  type PresetRef,
  type Track,
} from './project';

/**
 * Parses a .mid file (via spessasynth_core) into a ConductorProject. Each MIDI
 * track that contains notes becomes a Conductor track holding a single clip;
 * MIDI ticks are rescaled to our PPQ and tempo is taken from the first change.
 */
export function importMidiToProject(buffer: ArrayBuffer, fileName: string): ConductorProject {
  const midi = BasicMIDI.fromArrayBuffer(buffer, fileName);
  const division = midi.timeDivision > 0 ? midi.timeDivision : PPQ;
  const scale = PPQ / division;

  let bpm = 120;
  if (midi.tempoChanges.length > 0) {
    // tempoChanges are ordered last->first; the chronologically-first is last.
    const first = midi.tempoChanges[midi.tempoChanges.length - 1];
    if (first && first.tempo > 0) bpm = Math.round(first.tempo);
  }

  const tracks: Track[] = [];

  for (const mt of midi.tracks) {
    const events = mt.events as unknown as MIDIMessage[];
    const active = new Map<number, { tick: number; velocity: number }>();
    const collected: Note[] = [];
    let program = 0;
    let bankMSB = 0;
    let bankLSB = 0;
    let programSet = false;

    for (const ev of events) {
      const status = ev.statusByte as number;
      const type = status & 0xf0;
      const channel = status & 0x0f;
      const d0 = ev.data[0] ?? 0;
      const d1 = ev.data[1] ?? 0;

      if (type === 0xc0) {
        if (!programSet) {
          program = d0;
          programSet = true;
        }
      } else if (type === 0xb0) {
        if (d0 === 0) bankMSB = d1;
        else if (d0 === 32) bankLSB = d1;
      } else if (type === 0x90 && d1 > 0) {
        active.set(channel * 128 + d0, { tick: ev.ticks, velocity: d1 });
      } else if (type === 0x80 || (type === 0x90 && d1 === 0)) {
        const k = channel * 128 + d0;
        const on = active.get(k);
        if (on) {
          active.delete(k);
          collected.push({
            id: uid('note'),
            startTick: Math.round(on.tick * scale),
            durationTick: Math.max(1, Math.round((ev.ticks - on.tick) * scale)),
            pitch: d0,
            velocity: on.velocity,
          });
        }
      }
    }

    if (collected.length === 0) continue;

    const lengthTick = collected.reduce((m, n) => Math.max(m, n.startTick + n.durationTick), 0);
    const index = tracks.length;
    const clip: Clip = {
      id: uid('clp'),
      name: mt.name?.trim() || 'Clip',
      startTick: 0,
      lengthTick,
      notes: collected,
    };
    const preset: PresetRef = {
      soundfontId: DEFAULT_SOUNDFONT_ID,
      name: `Patch ${program}`,
      bankMSB,
      bankLSB,
      program,
    };
    tracks.push({
      id: uid('trk'),
      name: mt.name?.trim() || `Track ${index + 1}`,
      channel: index % MAX_TRACKS,
      preset,
      color: TRACK_COLORS[index % TRACK_COLORS.length]!,
      mute: false,
      solo: false,
      volume: 0.85,
      clips: [clip],
    });

    if (tracks.length >= MAX_TRACKS) break;
  }

  if (tracks.length === 0) tracks.push(createTrack(0));

  return {
    id: uid('prj'),
    name: fileName.replace(/\.midi?$/i, '') || 'Imported',
    bpm,
    ppq: PPQ,
    key: { tonic: 0, scale: 'major' },
    scaleLock: false,
    tracks,
  };
}
