'use client';

import { useCallback, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Button, Range } from '@/components/ui/controls';
import { MutedIcon, PauseIcon, PlayIcon, VolumeIcon } from '@/components/ui/icons';
import type { SourceState, StreamSourceState } from '@/hooks/useAudioSource';
import { formatClock } from '@/lib/time';

interface TransportBarProps {
  source: NonNullable<SourceState>;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  /** Stops a live capture (mic, desktop, or YouTube). */
  onStopCapture: () => void;
  /** Controls placed at the right end, such as the fullscreen button. */
  trailing?: ReactNode;
}

const CAPTURE_LABELS: Record<StreamSourceState['kind'], string> = {
  mic: 'Listening to your microphone',
  tab: 'Capturing desktop audio',
  youtube: 'Capturing the YouTube player',
};

/**
 * The one place playback is controlled. A file gets play, seek, and volume. A
 * live capture has nothing to seek, so it gets its status and a stop button.
 */
export function TransportBar({
  source,
  isPlaying,
  currentTime,
  duration,
  volume,
  muted,
  onTogglePlay,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onStopCapture,
  trailing,
}: TransportBarProps) {
  const effectiveVolume = muted ? 0 : volume;

  return (
    <div className="flex h-12 items-center gap-3 border-t border-torus-border bg-torus-panel px-3 text-xs text-torus-fg-dim">
      {source.kind === 'file' ? (
        <>
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-torus-fg text-torus-bg hover:bg-white"
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <span className="w-9 shrink-0 text-right tabular-nums">{formatClock(currentTime)}</span>
          <SeekBar currentTime={currentTime} duration={duration} onSeek={onSeek} />
          <span className="w-9 shrink-0 tabular-nums">{formatClock(duration)}</span>

          <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? 'Unmute' : 'Mute'}
              className="grid h-8 w-8 place-items-center rounded-md hover:bg-torus-raised hover:text-torus-fg"
            >
              {muted || volume === 0 ? <MutedIcon /> : <VolumeIcon />}
            </button>
            <Range
              value={effectiveVolume}
              min={0}
              max={1}
              step={0.01}
              onChange={onVolumeChange}
              ariaLabel="Volume"
              className="!w-20"
            />
          </div>

          <span
            className="hidden min-w-0 max-w-[14rem] truncate text-torus-fg-faint lg:block"
            title={source.fileName}
          >
            {source.fileName}
          </span>
        </>
      ) : (
        <>
          <span className="h-2 w-2 shrink-0 rounded-full bg-torus-mid" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-torus-fg">
            {CAPTURE_LABELS[source.kind]}
          </span>
          <Button size="sm" onClick={onStopCapture}>
            Stop
          </Button>
        </>
      )}
      {trailing}
    </div>
  );
}

interface SeekBarProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}

function SeekBar({ currentTime, duration, onSeek }: SeekBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const bar = barRef.current;
      if (!bar || duration <= 0) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onSeek(ratio * duration);
    },
    [duration, onSeek],
  );

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    seekFromClientX(e.clientX);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (draggingRef.current) seekFromClientX(e.clientX);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    const step = e.shiftKey ? 15 : 5;
    const targets: Record<string, number> = {
      ArrowLeft: Math.max(0, currentTime - step),
      ArrowRight: Math.min(duration, currentTime + step),
      Home: 0,
      End: duration,
    };
    const target = targets[e.key];
    if (target === undefined) return;
    e.preventDefault();
    // The page also seeks on the arrow keys. Stop here so one press moves once.
    e.stopPropagation();
    onSeek(target);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={barRef}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(currentTime)}
      aria-valuetext={`${formatClock(currentTime)} of ${formatClock(duration)}`}
      tabIndex={0}
      className="relative h-8 min-w-0 flex-1 cursor-pointer touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-torus-border-strong">
        <div className="h-full bg-torus-mid" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
