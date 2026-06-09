'use client';

import { useEffect, useRef, useState } from 'react';
import type { AnalyserHandle } from '@torus/visualizers';
import type { WaveformPalette } from '@torus/shared';
import { EditableNumber } from '@/components/EditableNumber';

interface BandSplitterProps {
  analyser: AnalyserHandle | null;
  palette: WaveformPalette;
  bassMaxHz: number;
  midMaxHz: number;
  onChange: (next: { bassMaxHz?: number; midMaxHz?: number }) => void;
}

// Log-scaled frequency axis: 20Hz on the left, sample-rate Nyquist on the right.
const MIN_HZ = 20;
const HANDLE_GAP_HZ = 30;
const MIN_BASS_HZ = 30;

function hzToX(hz: number, width: number, maxHz: number): number {
  const lo = Math.log10(MIN_HZ);
  const hi = Math.log10(maxHz);
  return ((Math.log10(Math.max(MIN_HZ, hz)) - lo) / (hi - lo)) * width;
}

function xToHz(x: number, width: number, maxHz: number): number {
  const lo = Math.log10(MIN_HZ);
  const hi = Math.log10(maxHz);
  const t = Math.max(0, Math.min(1, x / width));
  return Math.pow(10, lo + t * (hi - lo));
}

function formatHz(hz: number): string {
  if (hz >= 1000) return `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)}k`;
  return `${Math.round(hz)}`;
}

export function BandSplitter({
  analyser,
  palette,
  bassMaxHz,
  midMaxHz,
  onChange,
}: BandSplitterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<'bass' | 'mid' | null>(null);
  const [, forceRerender] = useState(0);

  const sampleRate = analyser?.sampleRate ?? 44100;
  const nyquist = sampleRate / 2;
  const maxHz = nyquist;

  // Live FFT draw loop.
  useEffect(() => {
    if (!analyser) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const buf = new Uint8Array(2048);

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }
      const w = canvas.width;
      const h = canvas.height;
      const bins = analyser.getFrequencyData(buf);

      ctx.clearRect(0, 0, w, h);

      if (bins > 0) {
        const binWidth = nyquist / bins;
        // Draw FFT bars. For each pixel column, find which bin maps there.
        // Doing it pixel-by-pixel (not bin-by-bin) gives a nice log-spread.
        ctx.lineWidth = 1 * dpr;
        const bassX = hzToX(bassMaxHz, w, maxHz);
        const midX = hzToX(midMaxHz, w, maxHz);

        for (let px = 0; px < w; px++) {
          const hz = xToHz(px, w, maxHz);
          // Average a small window of bins around hz for visual smoothness.
          const hzNext = xToHz(px + 1, w, maxHz);
          const binLo = Math.max(0, Math.floor(hz / binWidth));
          const binHi = Math.max(binLo + 1, Math.min(bins, Math.ceil(hzNext / binWidth)));
          let sum = 0;
          for (let b = binLo; b < binHi; b++) sum += buf[b]!;
          const v = sum / (binHi - binLo) / 255;
          const barH = Math.pow(v, 0.7) * h;
          const color = px < bassX ? palette.bass : px < midX ? palette.mid : palette.high;
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.65;
          ctx.fillRect(px, h - barH, 1, barH);
        }

        ctx.globalAlpha = 1;

        // Crossover guide lines.
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 1 * dpr;
        ctx.beginPath();
        ctx.moveTo(bassX, 0);
        ctx.lineTo(bassX, h);
        ctx.moveTo(midX, 0);
        ctx.lineTo(midX, h);
        ctx.stroke();
      } else {
        // No audio: draw faint band tint background so the UI still shows.
        const bassX = hzToX(bassMaxHz, w, maxHz);
        const midX = hzToX(midMaxHz, w, maxHz);
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = palette.bass;
        ctx.fillRect(0, 0, bassX, h);
        ctx.fillStyle = palette.mid;
        ctx.fillRect(bassX, 0, midX - bassX, h);
        ctx.fillStyle = palette.high;
        ctx.fillRect(midX, 0, w - midX, h);
        ctx.globalAlpha = 1;
      }

      raf = requestAnimationFrame(draw);
    };

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(draw);
    };
    document.addEventListener('visibilitychange', onVisibility);

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [analyser, palette, bassMaxHz, midMaxHz, maxHz, nyquist]);

  // Handle drag with pointer capture on the container.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const hz = xToHz(x, rect.width, maxHz);
      if (dragRef.current === 'bass') {
        const clamped = Math.max(MIN_BASS_HZ, Math.min(midMaxHz - HANDLE_GAP_HZ, hz));
        onChange({ bassMaxHz: Math.round(clamped) });
      } else {
        const clamped = Math.max(bassMaxHz + HANDLE_GAP_HZ, Math.min(maxHz - 100, hz));
        onChange({ midMaxHz: Math.round(clamped) });
      }
    };

    const handleUp = (e: PointerEvent) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      try {
        container.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      forceRerender((n) => n + 1);
    };

    container.addEventListener('pointermove', handleMove);
    container.addEventListener('pointerup', handleUp);
    container.addEventListener('pointercancel', handleUp);

    return () => {
      container.removeEventListener('pointermove', handleMove);
      container.removeEventListener('pointerup', handleUp);
      container.removeEventListener('pointercancel', handleUp);
    };
  }, [bassMaxHz, midMaxHz, maxHz, onChange]);

  const startDrag = (which: 'bass' | 'mid') => (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = which;
    try {
      containerRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    forceRerender((n) => n + 1);
  };

  const nudge = (which: 'bass' | 'mid', direction: -1 | 1) => {
    // Multiplicative steps feel even on the log-scaled axis.
    const factor = direction > 0 ? 1.06 : 1 / 1.06;
    if (which === 'bass') {
      const next = Math.max(MIN_BASS_HZ, Math.min(midMaxHz - HANDLE_GAP_HZ, bassMaxHz * factor));
      onChange({ bassMaxHz: Math.round(next) });
    } else {
      const next = Math.max(bassMaxHz + HANDLE_GAP_HZ, Math.min(maxHz - 100, midMaxHz * factor));
      onChange({ midMaxHz: Math.round(next) });
    }
  };

  const handleKeyDown = (which: 'bass' | 'mid') => (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      nudge(which, -1);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      nudge(which, 1);
    }
  };

  return (
    <div className="block text-xs text-torus-fg-dim">
      <div className="mb-1 flex items-center justify-between">
        <span>Bands</span>
        <span className="flex items-center gap-2 text-[10px] text-torus-fg-faint">
          <span style={{ color: palette.bass }}>low</span>
          <EditableNumber
            value={bassMaxHz}
            onCommit={(v) => onChange({ bassMaxHz: Math.max(MIN_BASS_HZ, Math.round(v)) })}
            format={formatHz}
            ariaLabel="Bass max Hz"
          />
          <span style={{ color: palette.mid }}>mid</span>
          <EditableNumber
            value={midMaxHz}
            onCommit={(v) => onChange({ midMaxHz: Math.round(v) })}
            format={formatHz}
            ariaLabel="Mid max Hz"
          />
          <span style={{ color: palette.high }}>high</span>
        </span>
      </div>
      <div
        ref={containerRef}
        className="relative h-16 w-full overflow-hidden rounded border border-torus-border bg-torus-bg/60 touch-none select-none"
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <Handle
          left={`${(hzToX(bassMaxHz, 100, maxHz)).toFixed(2)}%`}
          color={palette.bass}
          onPointerDown={startDrag('bass')}
          onKeyDown={handleKeyDown('bass')}
          title={`${formatHz(bassMaxHz)}Hz`}
          label="Bass / mid crossover"
          value={bassMaxHz}
          min={MIN_BASS_HZ}
          max={midMaxHz - HANDLE_GAP_HZ}
        />
        <Handle
          left={`${(hzToX(midMaxHz, 100, maxHz)).toFixed(2)}%`}
          color={palette.mid}
          onPointerDown={startDrag('mid')}
          onKeyDown={handleKeyDown('mid')}
          title={`${formatHz(midMaxHz)}Hz`}
          label="Mid / high crossover"
          value={midMaxHz}
          min={bassMaxHz + HANDLE_GAP_HZ}
          max={maxHz - 100}
        />
      </div>
      <p className="mt-1 text-[10px] text-torus-fg-faint">
        Drag the handles (or use arrow keys) to set where bass, mid, and high split.
      </p>
    </div>
  );
}

function Handle({
  left,
  color,
  onPointerDown,
  onKeyDown,
  title,
  label,
  value,
  min,
  max,
}: {
  left: string;
  color: string;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  title: string;
  label: string;
  value: number;
  min: number;
  max: number;
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      title={title}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
      aria-valuetext={`${formatHz(value)}Hz`}
      className="absolute top-0 h-full w-4 -translate-x-1/2 cursor-ew-resize touch-none outline-none focus-visible:bg-white/10"
      style={{ left }}
    >
      <div
        className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2"
        style={{ background: color, opacity: 0.85 }}
      />
      <div
        className="absolute left-1/2 top-1 h-2 w-2 -translate-x-1/2 rounded-full border border-white/40"
        style={{ background: color }}
      />
      <div
        className="absolute left-1/2 bottom-1 h-2 w-2 -translate-x-1/2 rounded-full border border-white/40"
        style={{ background: color }}
      />
    </div>
  );
}
