'use client';

import { Button, cx, inputClass } from '@/components/ui/controls';
import { PauseIcon, PlayIcon, SkipBackIcon } from '@/components/ui/icons';
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

/** Formats a tick as `bar.beat`, counting both from 1. */
function formatPosition(tick: number): string {
  const bar = Math.floor(tick / TICKS_PER_BAR) + 1;
  const beat = Math.floor((tick % TICKS_PER_BAR) / PPQ) + 1;
  return `${bar}.${beat}`;
}

const compactField = cx(inputClass, 'px-2 py-1 text-xs');
const iconButton =
  'grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40';

function Divider() {
  return <div className="mx-1 h-6 w-px bg-torus-border" aria-hidden="true" />;
}

/**
 * Conductor's top bar: the project name, playback, tempo and key, and MIDI
 * import and export. It leaves room on the left for the app launcher, which
 * is fixed to the corner of every page.
 */
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
    <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-torus-border bg-torus-panel py-2 pl-[3.75rem] pr-3">
      <h1 className="text-sm font-semibold tracking-tight text-torus-fg">
        torus <span className="font-normal text-torus-fg-faint">conductor</span>
      </h1>

      <input
        value={project.name}
        onChange={(e) => dispatch({ type: 'renameProject', name: e.target.value })}
        aria-label="Project name"
        className="w-36 rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] font-medium text-torus-fg hover:border-torus-border focus:border-torus-border-strong"
      />

      <Divider />

      <button
        type="button"
        onClick={isPlaying ? pause : () => play()}
        disabled={transportDisabled}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        className={cx(iconButton, 'bg-torus-fg text-torus-bg hover:bg-white')}
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>
      <button
        type="button"
        onClick={stopAndRewind}
        disabled={transportDisabled}
        aria-label="Stop and go back to the start"
        title="Stop and go back to the start"
        className={cx(iconButton, 'text-torus-fg-dim hover:bg-torus-raised hover:text-torus-fg')}
      >
        <SkipBackIcon />
      </button>

      <span
        className="w-10 text-[13px] tabular-nums text-torus-fg-dim"
        title="Position as bar.beat"
      >
        {formatPosition(playheadTick)}
      </span>

      <button
        type="button"
        onClick={() => setLoopEnabled(!loop.enabled)}
        aria-pressed={loop.enabled}
        className={cx(
          'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
          loop.enabled
            ? 'border-torus-mid bg-torus-raised text-torus-fg'
            : 'border-torus-border text-torus-fg-dim hover:border-torus-border-strong hover:text-torus-fg',
        )}
      >
        Loop
      </button>

      <Divider />

      <label className="flex items-center gap-1.5 text-xs text-torus-fg-dim">
        BPM
        <input
          type="number"
          min={20}
          max={300}
          value={project.bpm}
          onChange={(e) => dispatch({ type: 'setBpm', bpm: Number(e.target.value) })}
          className={cx(compactField, 'w-16 tabular-nums')}
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-torus-fg-dim">
        Key
        <select
          value={project.key.tonic}
          onChange={(e) => dispatch({ type: 'setKey', key: { tonic: Number(e.target.value) } })}
          className={compactField}
        >
          {NOTE_NAMES.map((name, index) => (
            <option key={name} value={index}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-xs text-torus-fg-dim">
        Scale
        <select
          value={project.key.scale}
          onChange={(e) => dispatch({ type: 'setKey', key: { scale: e.target.value as ScaleId } })}
          className={compactField}
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
          <Button size="sm" onClick={onImportMidi}>
            Import MIDI
          </Button>
        ) : null}
        {onExportMidi ? (
          <Button size="sm" onClick={onExportMidi}>
            Export MIDI
          </Button>
        ) : null}
        {onVisualize ? (
          <Button size="sm" variant="primary" onClick={onVisualize} disabled={!engineReady}>
            Visualize
          </Button>
        ) : null}
      </div>
    </header>
  );
}
