'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useToast } from '@/hooks/useToast';
import { useConductor } from '@/lib/conductor/store';
import { conductorEngine } from '@/lib/conductor/engine';
import { downloadProjectMidi } from '@/lib/conductor/midiExport';
import { importMidiToProject } from '@/lib/conductor/midiImport';
import type { PresetRef } from '@/lib/conductor/project';
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
  trackId: string | null;
}

function formatBytes(n: number): string {
  if (n < 1_000_000) return `${(n / 1000).toFixed(0)} KB`;
  return `${(n / 1_000_000).toFixed(1)} MB`;
}

export function ConductorShell() {
  const { project, dispatch } = useConductor();
  const engine = useConductorEngine();
  const playback = useConductorPlayback(project);
  const { toast } = useToast();

  const [picker, setPicker] = useState<PickerState>({ open: false, trackId: null });
  const [editing, setEditing] = useState<{ trackId: string; clipId: string } | null>(null);
  const [visualizing, setVisualizing] = useState(false);
  const midiInputRef = useRef<HTMLInputElement>(null);

  const handleImportMidi = useCallback(
    async (file: File) => {
      try {
        const buffer = await file.arrayBuffer();
        const imported = importMidiToProject(buffer, file.name);
        playback.stop();
        dispatch({ type: 'load', project: imported });
      } catch {
        toast({ message: "Couldn't read that MIDI file", variant: 'error' });
      }
    },
    [dispatch, playback, toast],
  );

  const handleExportMidi = useCallback(() => {
    downloadProjectMidi(project);
  }, [project]);

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

  useEffect(() => {
    if (!engine.ready || engine.presets.length === 0) return;
    const track = project.tracks[0];
    if (!track) return;
    const resolved = engine.presets.find(
      (p) =>
        p.bankMSB === track.preset.bankMSB &&
        p.bankLSB === track.preset.bankLSB &&
        p.program === track.preset.program,
    );
    if (!resolved || resolved.name === track.preset.name) return;
    const defaultNames = new Set(['Piano', 'Patch 0']);
    if (!defaultNames.has(track.preset.name) && !defaultNames.has(track.name)) return;
    dispatch({
      type: 'setTrackPreset',
      trackId: track.id,
      preset: { ...track.preset, name: resolved.name },
    });
    if (defaultNames.has(track.name)) {
      dispatch({ type: 'renameTrack', trackId: track.id, name: resolved.name });
    }
  }, [engine.ready, engine.presets, project.tracks, dispatch]);

  useEffect(() => {
    if (editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.code !== 'Space') return;
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }
      e.preventDefault();
      if (!engine.ready || engine.loading) return;
      playback.toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, engine.ready, engine.loading, playback]);

  const editingClip = editing
    ? project.tracks
        .find((t) => t.id === editing.trackId)
        ?.clips.find((c) => c.id === editing.clipId) ?? null
    : null;
  const editingTrack = editing ? project.tracks.find((t) => t.id === editing.trackId) ?? null : null;

  const loadProgress = engine.loadProgress;
  const progressPct =
    loadProgress?.total && loadProgress.total > 0
      ? Math.min(100, Math.round((loadProgress.loaded / loadProgress.total) * 100))
      : null;

  return (
    <main className="flex h-dvh flex-col bg-torus-bg text-torus-fg">
      <TransportBar
        playback={playback}
        engineReady={engine.ready}
        engineLoading={engine.loading}
        onImportMidi={() => midiInputRef.current?.click()}
        onExportMidi={handleExportMidi}
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

      {engine.loading ? (
        <div className="border-b border-torus-border bg-torus-surface/50 px-4 py-2 text-xs text-torus-fg-dim">
          <div className="flex items-center gap-3">
            <span>Loading instruments…</span>
            {loadProgress ? (
              <span className="font-mono tabular-nums text-torus-fg-faint">
                {formatBytes(loadProgress.loaded)}
                {loadProgress.total ? ` / ${formatBytes(loadProgress.total)}` : ''}
                {progressPct !== null ? ` (${progressPct}%)` : ''}
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-torus-border">
            <div
              className={`h-full rounded-full bg-torus-mid transition-all ${
                progressPct === null ? 'w-1/3 motion-safe:animate-pulse' : ''
              }`}
              style={progressPct !== null ? { width: `${progressPct}%` } : undefined}
            />
          </div>
        </div>
      ) : null}

      {engine.error ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-torus-bass/40 bg-torus-bass/10 px-4 py-2 text-xs text-torus-bass">
          <span>Soundfont failed to load: {engine.error}</span>
          <button
            type="button"
            onClick={engine.retry}
            className="rounded-lg border border-torus-bass/50 bg-torus-bass/15 px-2.5 py-1 text-torus-bass transition-colors hover:bg-torus-bass/25"
          >
            Retry
          </button>
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
