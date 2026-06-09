'use client';

import { useConductor } from '@/lib/conductor/store';
import { PPQ } from '@/lib/conductor/project';
import { NOTE_NAMES, SCALE_IDS, SCALE_LABELS, type ScaleId } from '@/lib/conductor/scales';
import { TICKS_PER_BAR } from './layout';
import type { ConductorPlayback } from './useConductorPlayback';

interface TransportBarProps {
  playback: ConductorPlayback;
  onImportMidi?: () => void;
  onVisualize?: () => void;
}

function formatPosition(tick: number): string {
  const bar = Math.floor(tick / TICKS_PER_BAR) + 1;
  const beat = Math.floor((tick % TICKS_PER_BAR) / PPQ) + 1;
  return `${bar}.${beat}`;
}

export function TransportBar({ playback, onImportMidi, onVisualize }: TransportBarProps) {
  const { project, dispatch } = useConductor();
  const { isPlaying, playheadTick, loop, toggle, stop, setLoopEnabled } = playback;

  return (
    <header className="flex items-center gap-3 border-b border-torus-border bg-torus-bg/80 py-2 pl-14 pr-14 backdrop-blur-sm">
      <input
        value={project.name}
        onChange={(e) => dispatch({ type: 'renameProject', name: e.target.value })}
        aria-label="Project name"
        className="w-32 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium outline-none hover:border-torus-border focus:border-torus-border-strong"
      />

      <div className="mx-1 h-6 w-px bg-torus-border" />

      <button
        type="button"
        onClick={toggle}
        aria-label={isPlaying ? 'Stop' : 'Play'}
        className={`grid h-8 w-8 place-items-center rounded-lg border text-sm transition-colors ${
          isPlaying
            ? 'border-torus-bass/50 bg-torus-bass/20 text-torus-bass'
            : 'border-torus-border bg-torus-surface text-torus-fg hover:border-torus-border-strong'
        }`}
      >
        {isPlaying ? '\u25a0' : '\u25b6'}
      </button>
      <button
        type="button"
        onClick={stop}
        aria-label="Stop and rewind"
        className="grid h-8 w-8 place-items-center rounded-lg border border-torus-border bg-torus-surface text-xs text-torus-fg-dim transition-colors hover:border-torus-border-strong hover:text-torus-fg"
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

      <div className="ml-auto flex items-center gap-2">
        {onImportMidi ? (
          <button
            type="button"
            onClick={onImportMidi}
            className="rounded-lg border border-torus-border bg-torus-surface px-2.5 py-1.5 text-xs text-torus-fg-dim transition-colors hover:border-torus-border-strong hover:text-torus-fg"
          >
            Import MIDI
          </button>
        ) : null}
        {onVisualize ? (
          <button
            type="button"
            onClick={onVisualize}
            className="rounded-lg border border-torus-mid/40 bg-torus-mid/10 px-2.5 py-1.5 text-xs text-torus-mid transition-colors hover:bg-torus-mid/20"
          >
            Visualize
          </button>
        ) : null}
      </div>
    </header>
  );
}
