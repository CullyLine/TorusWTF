'use client';

import Link from 'next/link';
import {
  isFpsLocked,
  isResolutionLocked,
  type ExportFps,
  type ExportResolution,
} from '@/lib/export-config';
import { QualityWarning } from './QualityWarning';

interface ExportPanelProps {
  unlocked: boolean;
  resolution: ExportResolution;
  fps: ExportFps;
  onResolutionChange: (res: ExportResolution) => void;
  onFpsChange: (fps: ExportFps) => void;
  recording: boolean;
  rendering: boolean;
  elapsedSec: number;
  hasSource: boolean;
  onStart: () => void;
  onStop: () => void;
  onSnapshot: () => void;
}

const RESOLUTIONS: ExportResolution[] = ['720p', '1080p', '1440p', '4k'];
const FPS_OPTIONS: ExportFps[] = [30, 60, 120, 240];

export function ExportPanel({
  unlocked,
  resolution,
  fps,
  onResolutionChange,
  onFpsChange,
  recording,
  rendering,
  elapsedSec,
  hasSource,
  onStart,
  onStop,
  onSnapshot,
}: ExportPanelProps) {
  return (
    <section className="rounded-xl border border-torus-border bg-torus-surface p-4">
      <h2 className="mb-3 text-sm font-medium text-torus-fg-dim">Export</h2>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <label className="text-xs text-torus-fg-dim">
          Resolution
          <select
            value={resolution}
            onChange={(e) => {
              const next = e.target.value as ExportResolution;
              if (isResolutionLocked(next, unlocked)) return;
              onResolutionChange(next);
            }}
            className="mt-1 w-full rounded-lg border border-torus-border bg-torus-bg px-2 py-1.5 text-sm"
          >
            {RESOLUTIONS.map((res) => (
              <option key={res} value={res} disabled={isResolutionLocked(res, unlocked)}>
                {res}
                {isResolutionLocked(res, unlocked) ? ' (unlock)' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-torus-fg-dim">
          FPS
          <select
            value={fps}
            onChange={(e) => {
              const next = Number(e.target.value) as ExportFps;
              if (isFpsLocked(next, unlocked)) return;
              onFpsChange(next);
            }}
            className="mt-1 w-full rounded-lg border border-torus-border bg-torus-bg px-2 py-1.5 text-sm"
          >
            {FPS_OPTIONS.map((f) => (
              <option key={f} value={f} disabled={isFpsLocked(f, unlocked)}>
                {f}
                {isFpsLocked(f, unlocked) ? ' (unlock)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <QualityWarning resolution={resolution} fps={fps} />

      <p className="mb-3 text-[10px] text-torus-fg-faint">
        Exports as WebM (VP9 + Opus). MP4 when your browser supports it. Free exports include a
        small corner watermark.
      </p>

      {!unlocked ? (
        <p className="mb-3 text-xs text-torus-fg-dim">
          Free: 720p / 30 FPS with watermark.{' '}
          <Link href="/unlock" className="text-torus-mid hover:underline">
            Unlock $10
          </Link>{' '}
          for up to 4K / 240 FPS, no watermark.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {!recording ? (
          <button
            type="button"
            disabled={!hasSource || rendering}
            onClick={onStart}
            className="rounded-full bg-torus-mid/20 px-4 py-2 text-sm font-medium text-torus-mid border border-torus-mid/40 disabled:opacity-40"
          >
            {rendering ? 'Rendering…' : 'Record export'}
          </button>
        ) : (
          <button
            type="button"
            onClick={onStop}
            className="rounded-full bg-torus-bass/20 px-4 py-2 text-sm font-medium text-torus-bass border border-torus-bass/40"
          >
            Stop ({elapsedSec}s)
          </button>
        )}
        <button
          type="button"
          disabled={!hasSource || recording || rendering}
          onClick={onSnapshot}
          className="rounded-full border border-torus-border px-4 py-2 text-sm text-torus-fg-dim hover:border-torus-mid/40 hover:text-torus-mid disabled:opacity-40"
        >
          Snapshot PNG
        </button>
      </div>
    </section>
  );
}
