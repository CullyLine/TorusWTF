import { describe, expect, it } from 'vitest';
import { Midi } from '@tonejs/midi';
import { partsToMidi, partsToProject, splitNotes } from './parts';
import type { NoteEventTime } from './transcribe';

function note(pitchMidi: number, start = 0, duration = 1, amplitude = 0.8): NoteEventTime {
  return { startTimeSeconds: start, durationSeconds: duration, pitchMidi, amplitude };
}

describe('splitNotes', () => {
  it('keeps everything in one part when mode is none', () => {
    const parts = splitNotes([note(40), note(60), note(80)], 'none');
    expect(parts).toHaveLength(1);
    expect(parts[0]!.notes).toHaveLength(3);
  });

  it('partitions by pitch range and drops empty parts', () => {
    const parts = splitNotes([note(36), note(60), note(84)], 'range');
    expect(parts.map((p) => p.name)).toEqual(['Bass', 'Mid', 'Lead']);
    expect(parts[0]!.notes[0]!.pitchMidi).toBe(36);
    expect(parts[1]!.notes[0]!.pitchMidi).toBe(60);
    expect(parts[2]!.notes[0]!.pitchMidi).toBe(84);

    const onlyMid = splitNotes([note(60), note(64)], 'range');
    expect(onlyMid).toHaveLength(1);
    expect(onlyMid[0]!.name).toBe('Mid');
  });

  it('returns a single empty part for empty input', () => {
    expect(splitNotes([], 'range')).toHaveLength(1);
  });
});

describe('partsToProject', () => {
  it('converts seconds to ticks at the given bpm/ppq', () => {
    const project = partsToProject([{ name: 'Transcription', notes: [note(60, 0.5, 0.5)] }], {
      bpm: 120,
      name: 'Test',
    });
    expect(project.bpm).toBe(120);
    expect(project.ppq).toBe(480);
    const n = project.tracks[0]!.clips[0]!.notes[0]!;
    // 120bpm, 480ppq → 960 ticks/sec.
    expect(n.startTick).toBe(480);
    expect(n.durationTick).toBe(480);
    expect(n.pitch).toBe(60);
  });

  it('maps amplitude to a 1..127 velocity', () => {
    const project = partsToProject([{ name: 'T', notes: [note(60, 0, 1, 0)] }], { bpm: 120, name: 'x' });
    expect(project.tracks[0]!.clips[0]!.notes[0]!.velocity).toBe(1);
    const loud = partsToProject([{ name: 'T', notes: [note(60, 0, 1, 1)] }], { bpm: 120, name: 'x' });
    expect(loud.tracks[0]!.clips[0]!.notes[0]!.velocity).toBe(127);
  });

  it('makes one track per part with unique channels and at least one bar long', () => {
    const project = partsToProject(
      [
        { name: 'Bass', notes: [note(40)] },
        { name: 'Lead', notes: [note(80)] },
      ],
      { bpm: 120, name: 'multi' },
    );
    expect(project.tracks).toHaveLength(2);
    expect(project.tracks[0]!.channel).not.toBe(project.tracks[1]!.channel);
    expect(project.tracks[0]!.clips[0]!.lengthTick).toBeGreaterThanOrEqual(480 * 4);
  });
});

describe('partsToMidi', () => {
  it('produces a parseable MIDI file with one track per part', () => {
    const bytes = partsToMidi(
      [
        { name: 'Bass', notes: [note(40, 0, 1)] },
        { name: 'Lead', notes: [note(80, 1, 1)] },
      ],
      140,
    );
    const parsed = new Midi(bytes);
    expect(parsed.tracks).toHaveLength(2);
    expect(Math.round(parsed.header.tempos[0]!.bpm)).toBe(140);
    expect(parsed.tracks[0]!.notes[0]!.midi).toBe(40);
  });
});
