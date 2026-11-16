'use client';

import { useRef } from 'react';
import {
  Button,
  CheckboxField,
  Hint,
  Section,
  Segmented,
  SelectField,
  TextButton,
} from '@/components/ui/controls';
import {
  ASPECT_OPTIONS,
  EXPORT_FPS_OPTIONS,
  EXPORT_RESOLUTIONS,
  MAX_REALTIME_FPS,
  isFpsRealtimeCapable,
  type AspectRatio,
  type ExportFps,
  type ExportResolution,
} from '@/lib/export-config';

interface ExportPanelProps {
  resolution: ExportResolution;
  aspect: AspectRatio;
  fps: ExportFps;
  onResolutionChange: (res: ExportResolution) => void;
  onAspectChange: (aspect: AspectRatio) => void;
  onFpsChange: (fps: ExportFps) => void;
  recording: boolean;
  /** The recorder has stopped and the file is being assembled. */
  rendering: boolean;
  elapsedSec: number;
  hasSource: boolean;
  /** True when the source is an uploaded file, the only kind that can be rendered offline. */
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
  watermarkShow: boolean;
  watermarkImageDataUrl: string | null;
  onWatermarkShowChange: (show: boolean) => void;
  onWatermarkImageFile: (file: File) => void;
  onWatermarkImageReset: () => void;
}

const RESOLUTION_OPTIONS = EXPORT_RESOLUTIONS.map((res) => ({
  value: res,
  label: res === '4k' ? '4K' : res,
}));

// Selects carry strings, so frame rates round-trip through their text form.
const FPS_SELECT_OPTIONS = EXPORT_FPS_OPTIONS.map((fps) => ({
  value: String(fps),
  label: isFpsRealtimeCapable(fps) ? `${fps} fps` : `${fps} fps (render only)`,
}));

const ASPECT_SEGMENTS = ASPECT_OPTIONS.map((option) => ({
  value: option.id,
  label: option.label,
}));

function exportHint(hasSource: boolean, hasFileSource: boolean, canRender: boolean): string {
  if (!hasSource) return 'Add audio first. An export needs something to play.';
  if (canRender) {
    return 'Render full track gives the best quality. It draws every frame of your file without playing it. Record live captures what you see, in real time.';
  }
  if (hasFileSource) {
    return 'Record live captures what you see, in real time. Rendering a full track needs Chrome, Edge, or Firefox 130 or newer.';
  }
  return 'Record live captures what you see until you stop it. Rendering a full track works with uploaded files only.';
}

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
  watermarkShow,
  watermarkImageDataUrl,
  onWatermarkShowChange,
  onWatermarkImageFile,
  onWatermarkImageReset,
}: ExportPanelProps) {
  const watermarkFileInputRef = useRef<HTMLInputElement>(null);
  const busy = recording || rendering || prerenderActive;
  // Rendering gives the best quality, so it leads whenever the source allows it.
  const canRender = hasFileSource && prerenderSupported;
  const heavy = resolution === '4k' && fps >= 120;

  return (
    <>
      <Section title="Video">
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Resolution"
            value={resolution}
            options={RESOLUTION_OPTIONS}
            onChange={onResolutionChange}
          />
          <SelectField
            label="Frame rate"
            value={String(fps)}
            options={FPS_SELECT_OPTIONS}
            onChange={(value) => onFpsChange(Number(value) as ExportFps)}
          />
        </div>

        <div>
          <p className="mb-1 text-xs text-torus-fg-dim">Aspect ratio</p>
          <Segmented
            ariaLabel="Aspect ratio"
            value={aspect}
            options={ASPECT_SEGMENTS}
            onChange={onAspectChange}
          />
        </div>

        {!isFpsRealtimeCapable(fps) ? (
          <Hint>
            {fps} fps needs Render full track. Recording draws one frame per screen refresh, so it
            tops out near {MAX_REALTIME_FPS} fps.
          </Hint>
        ) : null}
        {heavy ? (
          <p className="rounded-md border border-torus-high/40 px-3 py-2 text-xs text-torus-high">
            4K at {fps} fps is slow on most graphics cards. 1080p or 60 fps renders much faster.
          </p>
        ) : null}

        {prerenderActive ? (
          <div
            role="status"
            aria-live="polite"
            className="rounded-md border border-torus-border-strong p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-torus-fg">Rendering MP4</span>
              <TextButton onClick={onCancelPrerender}>Cancel</TextButton>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-torus-border-strong">
              <div
                className="h-full bg-torus-mid transition-all"
                style={{ width: `${Math.round(prerenderProgressPercent * 100)}%` }}
              />
            </div>
            <Hint className="mt-2">{prerenderProgressMessage || 'Working'}</Hint>
          </div>
        ) : recording ? (
          <Button variant="danger" className="w-full" onClick={onStop}>
            Stop recording ({elapsedSec}s)
          </Button>
        ) : (
          <div className="space-y-2">
            {canRender ? (
              <Button variant="primary" className="w-full" disabled={busy} onClick={onPrerender}>
                Render full track (MP4)
              </Button>
            ) : null}
            <Button
              variant={canRender ? 'secondary' : 'primary'}
              className="w-full"
              disabled={!hasSource || busy}
              onClick={onStart}
            >
              {rendering ? 'Saving the recording' : 'Record live'}
            </Button>
            <Button className="w-full" disabled={!hasSource || busy} onClick={onSnapshot}>
              Save a snapshot (PNG)
            </Button>
          </div>
        )}

        {prerenderError ? <p className="text-xs text-torus-bass">{prerenderError}</p> : null}

        <Hint>{exportHint(hasSource, hasFileSource, canRender)}</Hint>
      </Section>

      <Section title="Watermark" defaultOpen={false}>
        <CheckboxField
          label="Show a watermark on exports"
          checked={watermarkShow}
          onChange={onWatermarkShowChange}
        />
        <div className={`flex flex-wrap items-center gap-2 ${watermarkShow ? '' : 'opacity-50'}`}>
          {watermarkImageDataUrl ? (
            <img
              src={watermarkImageDataUrl}
              alt="Your watermark"
              className="h-8 max-w-[7rem] rounded border border-torus-border bg-black object-contain px-1"
            />
          ) : (
            <span className="rounded bg-black px-2 py-1 text-[11px] font-semibold text-white">
              torus.wtf
            </span>
          )}
          <Button size="sm" onClick={() => watermarkFileInputRef.current?.click()}>
            Use your own logo
          </Button>
          <input
            ref={watermarkFileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onWatermarkImageFile(file);
              e.target.value = '';
            }}
          />
          {watermarkImageDataUrl ? (
            <TextButton onClick={onWatermarkImageReset}>Reset</TextButton>
          ) : null}
        </div>
      </Section>
    </>
  );
}
