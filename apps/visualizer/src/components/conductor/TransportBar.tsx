'use client';

import { useConductor } from '@/lib/conductor/store';
import { PPQ } from '@/lib/conductor/project';
import { NOTE_NAMES, SCALE_IDS, SCALE_LABELS, type ScaleId } from '@/lib/conductor/scales';
import { TICKS_PER_BAR } from './layout';
import type { ConductorPlayback } from './useConductorPlayback';

interface TransportBarProps {
  playback: ConductorPlayback;
  engineReady: boolean;
  engineLoading: boolean;
  onImportMidi?: () => void;
  onExportMidi?: () => void;
  onVisualize?: () => void;
}

function formatPosition(tick: number): string {
  const bar = Math.floor(tick / TICKS_PER_BAR) + 1;
  const beat = Math.floor((tick % TICKS_PER_BAR) / PPQ) + 1;
  return `${bar}.${beat}`;
}

export function TransportBar({
  playback,
  engineReady,
  engineLoading,
  onImportMidi,
  onExportMidi,
  onVisualize,
}: TransportBarProps) {
  const { project, dispatch } = useConductor();
  const { isPlaying, playheadTick, loop, play, pause, stopAndRewind, setLoopEnabled } = playback;
  const transportDisabled = !engineReady || engineLoading;

  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-torus-border bg-torus-bg/80 py-2 pl-14 pr-3 backdrop-blur-sm">
      <input
        value={project.name}
        onChange={(e) => dispatch({ type: 'renameProject', name: e.target.value })}
        aria-label="Project name"
        className="w-32 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium outline-none hover:border-torus-border focus:border-torus-border-strong"
      />

      <div className="mx-1 h-6 w-px bg-torus-border" />

      {isPlaying ? (
        <button
          type="button"
          onClick={pause}
          disabled={transportDisabled}
          aria-label="Pause"
          className="grid h-8 w-8 place-items-center rounded-lg border border-torus-mid/50 bg-torus-mid/15 text-sm text-torus-mid transition-colors hover:border-torus-mid/70 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {'\u23f8'}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => play()}
          disabled={transportDisabled}
          aria-label="Play"
          className="grid h-8 w-8 place-items-center rounded-lg border border-torus-border bg-torus-surface text-sm text-torus-fg transition-colors hover:border-torus-border-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          {'\u25b6'}
        </button>
      )}
      <button
        type="button"
        onClick={stopAndRewind}
        disabled={transportDisabled}
        aria-label="Stop and rewind"
        className="grid h-8 w-8 place-items-center rounded-lg border border-torus-border bg-torus-surface text-xs text-torus-fg-dim transition-colors hover:border-torus-border-strong hover:text-torus-fg disabled:cursor-not-allowed disabled:opacity-40"
      >
        {'\u23ee'}
      </button>

      <span className="ml-1 w-12 font-mono text-sm tabular-nums text-torus-fg-dim">
        {formatPosition(playheadTick)}
      </span>

      <button
        type="button"
        onClick={() => setLoopEnabled(!loop.enabled)}
        aria-pressed={loop.enabled}
        className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
          loop.enabled
            ? 'border-torus-mid/50 bg-torus-mid/15 text-torus-mid'
            : 'border-torus-border bg-torus-surface text-torus-fg-dim hover:text-torus-fg'
        }`}
      >
        Loop
      </button>

      <div className="mx-1 h-6 w-px bg-torus-border" />

      <label className="flex items-center gap-1.5 text-xs text-torus-fg-faint">
        BPM
        <input
          type="number"
          min={20}
          max={300}
          value={project.bpm}
          onChange={(e) => dispatch({ type: 'setBpm', bpm: Number(e.target.value) })}
          className="w-16 rounded-md border border-torus-border bg-torus-surface px-2 py-1 text-sm tabular-nums text-torus-fg outline-none focus:border-torus-border-strong"
        />
      </label>

      <div className="mx-1 h-6 w-px bg-torus-border" />

      <label className="flex items-center gap-1.5 text-xs text-torus-fg-faint">
        Key
        <select
          value={project.key.tonic}
          onChange={(e) => dispatch({ type: 'setKey', key: { tonic: Number(e.target.value) } })}
          aria-label="Project key"
          className="rounded-md border border-torus-border bg-torus-surface px-1.5 py-1 text-xs text-torus-fg outline-none focus:border-torus-border-strong"
        >
          {NOTE_NAMES.map((n, i) => (
            <option key={n} value={i}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-xs text-torus-fg-faint">
        Scale
        <select
          value={project.key.scale}
          onChange={(e) => dispatch({ type: 'setKey', key: { scale: e.target.value as ScaleId } })}
          aria-label="Project scale"
          className="rounded-md border border-torus-border bg-torus-surface px-1.5 py-1 text-xs text-torus-fg outline-none focus:border-torus-border-strong"
        >
          {SCALE_IDS.map((id) => (
            <option key={id} value={id}>
              {SCALE_LABELS[id]}
            </option>
          ))}
        </select>
      </label>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {onImportMidi ? (
          <button
            type="button"
            onClick={onImportMidi}
            className="rounded-lg border border-torus-border bg-torus-surface px-2.5 py-1.5 text-xs text-torus-fg-dim transition-colors hover:border-torus-border-strong hover:text-torus-fg"
          >
            Import MIDI
          </button>
        ) : null}
        {onExportMidi ? (
          <button
            type="button"
            onClick={onExportMidi}
            className="rounded-lg border border-torus-border bg-torus-surface px-2.5 py-1.5 text-xs text-torus-fg-dim transition-colors hover:border-torus-border-strong hover:text-torus-fg"
          >
            Export MIDI
          </button>
        ) : null}
        {onVisualize ? (
          <button
            type="button"
            onClick={onVisualize}
            disabled={!engineReady}
            className="rounded-lg border border-torus-mid/40 bg-torus-mid/10 px-2.5 py-1.5 text-xs text-torus-mid transition-colors hover:bg-torus-mid/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Visualize
          </button>
        ) : null}
      </div>
    </header>
  );
}
