'use client';

import { useCallback, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useConductor } from '@/lib/conductor/store';
import { conductorEngine } from '@/lib/conductor/engine';
import type { PresetRef } from '@/lib/conductor/project';
import { importMidiToProject } from '@/lib/conductor/midiImport';
import { useConductorEngine } from './useConductorEngine';
import { useConductorPlayback } from './useConductorPlayback';
import { TransportBar } from './TransportBar';
import { ArrangementView } from './ArrangementView';
import { InstrumentPicker } from './InstrumentPicker';
import { PianoRoll } from './PianoRoll';

const VisualizeOverlay = dynamic(
  () => import('./VisualizeOverlay').then((m) => m.VisualizeOverlay),
  { ssr: false },
);

interface PickerState {
  open: boolean;
  trackId: string | null; // null = create a new track
}

export function ConductorShell() {
  const { project, dispatch } = useConductor();
  const engine = useConductorEngine();
  const playback = useConductorPlayback(project);

  const [picker, setPicker] = useState<PickerState>({ open: false, trackId: null });
  const [editing, setEditing] = useState<{ trackId: string; clipId: string } | null>(null);
  const [visualizing, setVisualizing] = useState(false);
  const midiInputRef = useRef<HTMLInputElement>(null);

  const handleImportMidi = useCallback(async (file: File) => {
    const buffer = await file.arrayBuffer();
    const imported = importMidiToProject(buffer, file.name);
    playback.stop();
    dispatch({ type: 'load', project: imported });
  }, [dispatch, playback]);

  const handleVisualize = useCallback(() => {
    if (!playback.isPlaying) playback.play(0);
    setVisualizing(true);
  }, [playback]);

  const closeVisualize = useCallback(() => {
    playback.stop();
    setVisualizing(false);
  }, [playback]);

  const openNewInstrument = useCallback(() => setPicker({ open: true, trackId: null }), []);
  const openChangeInstrument = useCallback((trackId: string) => setPicker({ open: true, trackId }), []);

  const handlePick = useCallback(
    (preset: PresetRef) => {
      if (picker.trackId) {
        const track = project.tracks.find((t) => t.id === picker.trackId);
        dispatch({ type: 'setTrackPreset', trackId: picker.trackId, preset });
        if (track) conductorEngine.setChannelPreset(track.channel, preset);
      } else {
        dispatch({ type: 'addTrack', preset });
      }
      setPicker({ open: false, trackId: null });
    },
    [picker.trackId, project.tracks, dispatch],
  );

  const editingClip = editing
    ? project.tracks
        .find((t) => t.id === editing.trackId)
        ?.clips.find((c) => c.id === editing.clipId) ?? null
    : null;
  const editingTrack = editing ? project.tracks.find((t) => t.id === editing.trackId) ?? null : null;

  return (
    <main className="flex h-dvh flex-col bg-torus-bg text-torus-fg">
      <TransportBar
        playback={playback}
        onImportMidi={() => midiInputRef.current?.click()}
        onVisualize={handleVisualize}
      />

      <input
        ref={midiInputRef}
        type="file"
        accept=".mid,.midi"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) await handleImportMidi(file);
          e.target.value = '';
        }}
      />

      {engine.error ? (
        <div className="border-b border-torus-bass/40 bg-torus-bass/10 px-4 py-2 text-xs text-torus-bass">
          Soundfont failed to load: {engine.error}
        </div>
      ) : null}

      <ArrangementView
        playback={playback}
        onEditClip={(trackId, clipId) => setEditing({ trackId, clipId })}
        onNewInstrument={openNewInstrument}
        onChangeInstrument={openChangeInstrument}
      />

      {picker.open ? (
        <InstrumentPicker
          presets={engine.presets}
          soundfonts={engine.soundfonts}
          loading={engine.loading}
          title={picker.trackId ? 'Change instrument' : 'New instrument'}
          onPick={handlePick}
          onClose={() => setPicker({ open: false, trackId: null })}
          onUploadSoundfont={async (file) => {
            await engine.addSoundfont(file);
          }}
        />
      ) : null}

      {editing && editingClip && editingTrack ? (
        <PianoRoll
          track={editingTrack}
          clip={editingClip}
          playback={playback}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {visualizing ? <VisualizeOverlay onClose={closeVisualize} /> : null}
    </main>
  );
}
