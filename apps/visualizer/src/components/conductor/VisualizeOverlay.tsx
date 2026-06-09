'use client';

import { useEffect, useMemo, useRef } from 'react';
import { VisualizerCanvas, type AnalyserHandle } from '@torus/visualizers';
import { conductorEngine } from '@/lib/conductor/engine';

interface VisualizeOverlayProps {
  onClose: () => void;
}

const PALETTE = { bass: '#ff2d95', mid: '#22d3ce', high: '#f7e08c' };

/**
 * Fullscreen visualizer driven by Conductor's own AnalyserNode (the bridge from
 * the plan). Wraps the engine analyser in the visualizer's AnalyserHandle shape
 * and passes it as analyserOverride — no separate audio plumbing needed.
 */
export function VisualizeOverlay({ onClose }: VisualizeOverlayProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const handle = useMemo<AnalyserHandle | null>(() => {
    const analyser = conductorEngine.getAnalyser();
    if (!analyser) return null;
    return {
      getFrequencyData: (out: Uint8Array) => {
        analyser.getByteFrequencyData(out as Uint8Array<ArrayBuffer>);
        return analyser.frequencyBinCount;
      },
      getTimeDomainData: (out: Uint8Array) => {
        analyser.getByteTimeDomainData(out as Uint8Array<ArrayBuffer>);
        return analyser.frequencyBinCount;
      },
      get fftBinCount() {
        return analyser.frequencyBinCount;
      },
      get sampleRate() {
        return analyser.context.sampleRate;
      },
    };
  }, []);

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previousFocus.current?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black" role="presentation">
      <VisualizerCanvas
        preset="torus_field"
        palette={PALETTE}
        analyserOverride={handle}
        background="nebula"
      />
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close visualizer"
        className="absolute right-4 top-4 z-10 rounded-lg border border-torus-border bg-torus-bg/70 px-3 py-1.5 text-xs text-torus-fg-dim backdrop-blur-sm hover:text-torus-fg"
      >
        Close visualizer
      </button>
    </div>
  );
}
