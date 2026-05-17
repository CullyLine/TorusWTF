'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import dynamic from 'next/dynamic';
import type { VisualizerPreset, WaveformPalette } from '@torus/shared';

const VisualizerCanvas = dynamic(
  () => import('@torus/visualizers').then((mod) => mod.VisualizerCanvas),
  { ssr: false },
);

interface VisualizerOverlayProps {
  audioRef: RefObject<HTMLAudioElement | null>;
  preset: VisualizerPreset;
  palette: WaveformPalette | null;
  title: string | null;
  shareCode: string;
}

const DEFAULT_PALETTE = { bass: '#FF2D95', mid: '#22D3CE', high: '#F7E08C' };

export function VisualizerOverlay({
  audioRef,
  preset,
  palette,
  title,
  shareCode,
}: VisualizerOverlayProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (preset === 'none' || !preset) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'v' || e.key === 'V') {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape' && open) setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preset, open]);

  if (!preset || preset === 'none') return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open 3D visualizer (V)"
        className="rounded-full border border-torus-border-strong px-3 py-1.5 text-xs text-torus-fg hover:bg-torus-surface"
        title="3D visualizer (V)"
      >
        visualizer
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${title ?? 'clip'} fullscreen visualizer`}
          className="fixed inset-0 z-50 bg-torus-bg"
        >
          <div className="absolute inset-0">
            <VisualizerCanvas
              audioRef={audioRef}
              preset={preset}
              palette={palette ?? DEFAULT_PALETTE}
            />
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-6 text-torus-fg">
            <div>
              <div className="text-sm opacity-70">{title ?? 'untitled'}</div>
              <div className="font-mono text-xs opacity-50">torus.fm/{shareCode}</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close visualizer (Esc)"
              className="pointer-events-auto rounded-full border border-torus-border-strong bg-torus-bg/60 px-3 py-1.5 text-xs backdrop-blur hover:bg-torus-surface"
            >
              close · esc
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
