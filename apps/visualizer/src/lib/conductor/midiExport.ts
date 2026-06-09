import { Midi } from '@tonejs/midi';
import { ticksToSeconds, type ConductorProject } from './project';

export function projectToMidi(project: ConductorProject): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(project.bpm);

  for (const track of project.tracks) {
    const midiTrack = midi.addTrack();
    midiTrack.name = track.name;
    for (const clip of track.clips) {
      for (const note of clip.notes) {
        const startTick = clip.startTick + note.startTick;
        const time = ticksToSeconds(startTick, project.bpm, project.ppq);
        const duration = Math.max(
          0.01,
          ticksToSeconds(note.durationTick, project.bpm, project.ppq),
        );
        midiTrack.addNote({
          midi: note.pitch,
          time,
          duration,
          velocity: note.velocity / 127,
        });
      }
    }
  }

  return midi.toArray();
}

export function downloadProjectMidi(project: ConductorProject): void {
  const bytes = projectToMidi(project);
  const base = project.name.trim() || 'conductor-export';
  const safe = base.replace(/[^\w.-]+/g, '_').replace(/^_|_$/g, '') || 'conductor-export';
  const blob = new Blob([new Uint8Array(bytes)], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safe}.mid`;
  a.click();
  URL.revokeObjectURL(url);
}
