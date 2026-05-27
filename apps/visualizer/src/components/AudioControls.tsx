'use client';

import { useCallback, useRef, type PointerEvent } from 'react';

interface AudioControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AudioControls({
  isPlaying,
  currentTime,
  duration,
  volume,
  muted,
  onTogglePlay,
  onSeek,
  onVolumeChange,
  onToggleMute,
}: AudioControlsProps) {
  const seekBarRef = useRef<HTMLDivElement>(null);
  const seekDraggingRef = useRef(false);

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const bar = seekBarRef.current;
      if (!bar || duration <= 0) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onSeek(ratio * duration);
    },
    [duration, onSeek],
  );

  const onSeekPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    seekDraggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    seekFromClientX(e.clientX);
  };

  const onSeekPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!seekDraggingRef.current) return;
    seekFromClientX(e.clientX);
  };

  const onSeekPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    seekDraggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const effectiveVolume = muted ? 0 : volume;
  const volumeIcon = muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊';

  return (
    <section className="rounded-xl border border-torus-border bg-torus-surface/80 p-4 backdrop-blur-md">
      <h2 className="mb-3 text-sm font-medium text-torus-fg-dim">Audio controls</h2>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-torus-mid/40 bg-torus-mid/10 text-torus-mid transition hover:bg-torus-mid/20"
        >
          {isPlaying ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
              <rect x="2" y="2" width="3" height="10" rx="1" />
              <rect x="9" y="2" width="3" height="10" rx="1" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
              <path d="M3 2 L12 7 L3 12 Z" />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div
            ref={seekBarRef}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={currentTime}
            tabIndex={0}
            className="relative h-6 cursor-pointer touch-none"
            onPointerDown={onSeekPointerDown}
            onPointerMove={onSeekPointerMove}
            onPointerUp={onSeekPointerUp}
            onPointerCancel={onSeekPointerUp}
          >
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-torus-border">
              <div
                className="h-full rounded-full bg-torus-mid"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <div className="mt-0.5 flex justify-between text-[10px] tabular-nums text-torus-fg-faint">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute' : 'Mute'}
          className="shrink-0 rounded-md px-1.5 py-1 text-base leading-none transition hover:bg-torus-border/30"
        >
          <span aria-hidden="true">{volumeIcon}</span>
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={effectiveVolume}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          aria-label="Volume"
          className="w-full accent-torus-mid"
        />
        <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-torus-fg-faint">
          {Math.round(effectiveVolume * 100)}%
        </span>
      </div>
    </section>
  );
}
