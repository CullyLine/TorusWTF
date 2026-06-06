'use client';

import {
  ASPECT_OPTIONS,
  type AspectRatio,
  type ExportFps,
  type ExportResolution,
} from '@/lib/export-config';
import { QualityWarning } from './QualityWarning';

interface ExportPanelProps {
  resolution: ExportResolution;
  aspect: AspectRatio;
  fps: ExportFps;
  onResolutionChange: (res: ExportResolution) => void;
  onAspectChange: (aspect: AspectRatio) => void;
  onFpsChange: (fps: ExportFps) => void;
  recording: boolean;
  rendering: boolean;
  elapsedSec: number;
  hasSource: boolean;
  /** True if the current source is an uploaded file (pre-renderable). */
  hasFileSource: boolean;
  onStart: () => void;
  onStop: () => void;
  onSnapshot: () => void;
  onPrerender: () => void;
  onCancelPrerender: () => void;
  prerenderSupported: boolean;
  prerenderActive: boolean;
  prerenderProgressPercent: number;
  prerenderProgressMessage: string;
  prerenderError: string | null;
}

const RESOLUTIONS: ExportResolution[] = ['720p', '1080p', '1440p', '4k'];
const FPS_OPTIONS: ExportFps[] = [30, 60, 120, 240];

export function ExportPanel({
  resolution,
  aspect,
  fps,
  onResolutionChange,
  onAspectChange,
  onFpsChange,
  recording,
  rendering,
  elapsedSec,
  hasSource,
  hasFileSource,
  onStart,
  onStop,
  onSnapshot,
  onPrerender,
  onCancelPrerender,
  prerenderSupported,
  prerenderActive,
  prerenderProgressPercent,
  prerenderProgressMessage,
  prerenderError,
}: ExportPanelProps) {
  return (
    <section className="rounded-xl border border-torus-border bg-torus-surface p-4">
      <h2 className="mb-3 text-sm font-medium text-torus-fg-dim">Export</h2>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <label className="text-xs text-torus-fg-dim">
          Resolution
          <select
            value={resolution}
            onChange={(e) => onResolutionChange(e.target.value as ExportResolution)}
            className="mt-1 w-full rounded-lg border border-torus-border bg-torus-bg px-2 py-1.5 text-sm"
          >
            {RESOLUTIONS.map((res) => (
              <option key={res} value={res}>
                {res}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-torus-fg-dim">
          FPS
          <select
            value={fps}
            onChange={(e) => onFpsChange(Number(e.target.value) as ExportFps)}
            className="mt-1 w-full rounded-lg border border-torus-border bg-torus-bg px-2 py-1.5 text-sm"
          >
            {FPS_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-3">
        <p className="mb-2 text-xs text-torus-fg-dim">Aspect ratio</p>
        <div className="grid grid-cols-4 gap-2">
          {ASPECT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onAspectChange(opt.id)}
              className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs transition-colors ${
                aspect === opt.id
                  ? 'border-torus-mid/50 bg-torus-mid/10 text-torus-mid'
                  : 'border-torus-border text-torus-fg-dim hover:border-torus-mid/30'
              }`}
            >
              <span className="text-base leading-none">{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      <QualityWarning resolution={resolution} fps={fps} />

      <p className="mb-3 text-[10px] text-torus-fg-faint">
        Exports as WebM (VP9 + Opus). MP4 when your browser supports it. Up to 4K / 240 FPS,
        watermark-free — all free.
      </p>

      <div className="mb-3">
        {prerenderActive ? (
          <div className="rounded-lg border border-torus-mid/40 bg-torus-mid/10 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-torus-mid">
                Pre-rendering MP4…
              </span>
              <button
                type="button"
                onClick={onCancelPrerender}
                className="text-[10px] text-torus-fg-dim hover:text-torus-bass"
              >
                Cancel
              </button>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-torus-border/40">
              <div
                className="h-full bg-torus-mid transition-all"
                style={{ width: `${Math.round(prerenderProgressPercent * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-[10px] text-torus-fg-dim">
              {prerenderProgressMessage || 'Working…'}
            </p>
          </div>
        ) : (
          <button
            type="button"
            disabled={
              !hasFileSource ||
              recording ||
              rendering ||
              !prerenderSupported
            }
            onClick={onPrerender}
            className="w-full rounded-full border border-torus-mid/40 bg-torus-mid/10 px-4 py-2 text-sm font-medium text-torus-mid disabled:opacity-40"
            title={
              !prerenderSupported
                ? 'Pre-render needs Chrome/Edge or Firefox 130+ (WebCodecs). Use Record export instead.'
                : !hasFileSource
                  ? 'Pre-render works on uploaded files only.'
                  : 'Render the full song to MP4 without playing it through.'
            }
          >
            Export Pre-Rendered Video
          </button>
        )}
        {!prerenderSupported ? (
          <p className="mt-2 text-[10px] text-torus-fg-faint">
            Pre-render needs Chrome/Edge or Firefox 130+. Use Record export
            below as a fallback.
          </p>
        ) : null}
        {prerenderError ? (
          <p className="mt-2 text-[10px] text-torus-bass">{prerenderError}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {!recording ? (
          <button
            type="button"
            disabled={!hasSource || rendering || prerenderActive}
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
          disabled={!hasSource || recording || rendering || prerenderActive}
          onClick={onSnapshot}
          className="rounded-full border border-torus-border px-4 py-2 text-sm text-torus-fg-dim hover:border-torus-mid/40 hover:text-torus-mid disabled:opacity-40"
        >
          Snapshot PNG
        </button>
      </div>
    </section>
  );
}
