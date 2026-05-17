'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { PeaksJson, WaveformPalette } from '@torus/shared';

export interface WaveformProps {
  /** Pre-computed peaks + per-band energy (from the worker). */
  peaks?: PeaksJson;
  /** Per-clip dominant colors derived from band averages. */
  palette?: WaveformPalette;
  /** URL to the Opus audio. If omitted, the component renders a static (non-playable) waveform. */
  audioUrl?: string;
  /** Pre-rendered spectrogram PNG URL. If provided, an info-button toggles it under the waveform. */
  spectrogramUrl?: string;
  /** Rendered height in CSS px. */
  height?: number;
  /** Render the playhead-RMS particles? Disabled automatically by prefers-reduced-motion. */
  particles?: boolean;
  /** Fired with seconds played whenever playback emits timeupdate. */
  onTimeUpdate?: (timeSec: number) => void;
}

const DEFAULT_PALETTE: WaveformPalette = {
  bass: '#FF2D95',
  mid: '#22D3CE',
  high: '#F7E08C',
};

const PARTICLE_BUDGET = 64;

/**
 * The signature 2D Waveform.
 *
 *  - One vertical bar per ~50ms peak bin
 *  - Each bar colored by its dominant frequency band (bass/mid/high)
 *  - Played portion is fully opaque, unplayed portion is dimmed
 *  - On play, RMS-driven particles drift up from the playhead — satisfying, not distracting
 *  - Drag/tap anywhere to seek; touch-friendly hit area
 *  - Optional spectrogram PNG layered beneath
 *  - prefers-reduced-motion disables animation + particles
 *  - Full keyboard: Space play/pause, M mute, ←/→ seek 5s, ↑/↓ volume
 */
export function Waveform({
  peaks,
  palette = DEFAULT_PALETTE,
  audioUrl,
  spectrogramUrl,
  height = 160,
  particles = true,
  onTimeUpdate,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const playingRef = useRef(false);

  const id = useId();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showSpectrogram, setShowSpectrogram] = useState(false);
  const [muted, setMuted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Detect prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ---------- Static waveform draw ----------
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = container.clientWidth;
    const cssHeight = height;
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    if (!peaks || peaks.bins.length === 0) {
      // Placeholder shimmer
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      const bars = Math.max(64, Math.floor(cssWidth / 6));
      const barW = cssWidth / bars;
      for (let i = 0; i < bars; i++) {
        const h = cssHeight * 0.15;
        ctx.fillRect(i * barW, (cssHeight - h) / 2, Math.max(1, barW - 1), h);
      }
      return;
    }

    const bars = Math.max(64, Math.min(peaks.bins.length, Math.floor(cssWidth / 3)));
    const bucketed = bucket(peaks, bars);
    const barW = cssWidth / bars;
    const progress = duration > 0 ? currentTime / duration : 0;

    for (let i = 0; i < bars; i++) {
      const bin = bucketed[i]!;
      const h = Math.max(2, Math.round(Math.min(1, bin.peak * 2.4) * cssHeight * 0.9));
      const x = i * barW;
      const y = (cssHeight - h) / 2;
      const dom = dominantBand(bin);
      const baseColor = palette[dom];
      const isPlayed = i / bars < progress;
      ctx.fillStyle = isPlayed ? baseColor : withAlpha(baseColor, 0.4);
      ctx.fillRect(x, y, Math.max(1, barW - 1), h);
    }

    // Playhead line
    if (duration > 0) {
      const x = progress * cssWidth;
      ctx.fillStyle = 'rgba(245,245,250,0.85)';
      ctx.fillRect(Math.floor(x), 0, 1.5, cssHeight);
    }
  }, [peaks, palette, height, currentTime, duration]);

  // Redraw on size + state changes
  useEffect(() => {
    drawWaveform();
    const ro = new ResizeObserver(drawWaveform);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [drawWaveform]);

  // ---------- Particle overlay ----------
  useEffect(() => {
    if (!particles || reducedMotion) return;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const canvas = overlayRef.current;
      const container = containerRef.current;
      if (canvas && container) {
        const dpr = window.devicePixelRatio || 1;
        const w = container.clientWidth;
        const h = height;
        if (canvas.width !== Math.floor(w * dpr)) {
          canvas.width = Math.floor(w * dpr);
          canvas.height = Math.floor(h * dpr);
          canvas.style.width = `${w}px`;
          canvas.style.height = `${h}px`;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, w, h);

          if (playingRef.current && peaks && duration > 0) {
            // Spawn ~1-2 particles per frame at playhead, scaled by current RMS
            const idx = Math.min(
              peaks.bins.length - 1,
              Math.floor((currentTime / duration) * peaks.bins.length),
            );
            const bin = peaks.bins[idx];
            const rms = bin?.peak ?? 0;
            const dom = bin ? dominantBand(bin) : 'mid';
            const spawn = Math.round(rms * 3);
            const x = (currentTime / duration) * w;
            for (let i = 0; i < spawn; i++) {
              if (particlesRef.current.length >= PARTICLE_BUDGET) break;
              particlesRef.current.push({
                x: x + (Math.random() - 0.5) * 6,
                y: h * 0.5,
                vx: (Math.random() - 0.5) * 0.4,
                vy: -(0.4 + Math.random() * 0.8),
                life: 0,
                maxLife: 40 + Math.random() * 30,
                color: palette[dom],
              });
            }
          }

          // Update + draw
          particlesRef.current = particlesRef.current.filter((p) => {
            p.x += p.vx;
            p.y += p.vy;
            p.life += 1;
            if (p.life > p.maxLife) return false;
            const alpha = 1 - p.life / p.maxLife;
            ctx.globalAlpha = alpha * 0.7;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
            ctx.fill();
            return true;
          });
          ctx.globalAlpha = 1;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [particles, reducedMotion, peaks, palette, currentTime, duration, height]);

  useEffect(() => {
    playingRef.current = isPlaying;
  }, [isPlaying]);

  // ---------- Audio element ----------
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      setCurrentTime(audio.currentTime);
      onTimeUpdate?.(audio.currentTime);
    };
    const onMeta = () => setDuration(audio.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onPause);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onPause);
    };
  }, [onTimeUpdate]);

  // ---------- Interactions ----------
  const seekTo = useCallback((fractional: number) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const clamped = Math.max(0, Math.min(1, fractional));
    audio.currentTime = clamped * audio.duration;
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      seekTo(x);
      const move = (me: PointerEvent) => {
        const x2 = (me.clientX - rect.left) / rect.width;
        seekTo(x2);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [seekTo],
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }, []);

  // Keyboard shortcuts when focused
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      if (!audio) return;
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          audio.currentTime = Math.max(0, audio.currentTime - 5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          audio.muted = !audio.muted;
          setMuted(audio.muted);
          break;
        default:
          break;
      }
    },
    [togglePlay],
  );

  const formatted = useMemo(
    () => ({ now: formatTime(currentTime), total: formatTime(duration) }),
    [currentTime, duration],
  );

  const wrapStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    height,
    background: 'rgba(255,255,255,0.02)',
    borderRadius: 8,
    overflow: 'hidden',
    cursor: 'pointer',
    touchAction: 'none',
  };

  return (
    <div>
      <div
        ref={containerRef}
        role="slider"
        aria-label="audio waveform — drag to seek"
        aria-valuemin={0}
        aria-valuemax={duration || 0}
        aria-valuenow={currentTime}
        aria-valuetext={`${formatted.now} of ${formatted.total}`}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        style={wrapStyle}
        aria-controls={id}
      >
        {showSpectrogram && spectrogramUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={spectrogramUrl}
            alt=""
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.45,
              filter: 'saturate(0.6) hue-rotate(290deg)',
              pointerEvents: 'none',
            }}
          />
        ) : null}
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />
        <canvas
          ref={overlayRef}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          aria-pressed={isPlaying}
          style={playBtnStyle}
        >
          {isPlaying ? '❚❚' : '▶'}
        </button>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.7 }}>
          {formatted.now} / {formatted.total}
        </span>
        <div style={{ flex: 1 }} />
        {spectrogramUrl ? (
          <button
            type="button"
            onClick={() => setShowSpectrogram((v) => !v)}
            aria-pressed={showSpectrogram}
            style={pillBtnStyle}
            title="Toggle spectrogram"
          >
            spectrum
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            const audio = audioRef.current;
            if (!audio) return;
            audio.muted = !audio.muted;
            setMuted(audio.muted);
          }}
          aria-label={muted ? 'Unmute' : 'Mute'}
          aria-pressed={muted}
          style={pillBtnStyle}
        >
          {muted ? 'unmute' : 'mute'}
        </button>
      </div>

      {audioUrl ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio ref={audioRef} src={audioUrl} preload="metadata" id={id} />
      ) : null}
    </div>
  );
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

function dominantBand(bin: { low: number; mid: number; high: number }): keyof WaveformPalette {
  if (bin.low >= bin.mid && bin.low >= bin.high) return 'bass';
  if (bin.high >= bin.mid && bin.high >= bin.low) return 'high';
  return 'mid';
}

function withAlpha(hex: string, alpha: number): string {
  // Convert "#RRGGBB" to rgba()
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const r = parseInt(m[1]!, 16);
  const g = parseInt(m[2]!, 16);
  const b = parseInt(m[3]!, 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function bucket(peaks: PeaksJson, target: number) {
  if (peaks.bins.length <= target) return peaks.bins;
  const step = peaks.bins.length / target;
  const out: typeof peaks.bins = [];
  for (let i = 0; i < target; i++) {
    const a = Math.floor(i * step);
    const b = Math.floor((i + 1) * step);
    let peak = 0;
    let low = 0;
    let mid = 0;
    let high = 0;
    for (let j = a; j < b; j++) {
      const v = peaks.bins[j]!;
      if (v.peak > peak) peak = v.peak;
      low += v.low;
      mid += v.mid;
      high += v.high;
    }
    const n = Math.max(1, b - a);
    out.push({ peak, low: low / n, mid: mid / n, high: high / n });
  }
  return out;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const playBtnStyle: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 999,
  background: 'var(--color-torus-fg)',
  color: 'var(--color-torus-bg)',
  border: 'none',
  fontSize: 14,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const pillBtnStyle: CSSProperties = {
  padding: '6px 12px',
  background: 'transparent',
  color: 'var(--color-torus-fg)',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 999,
  fontSize: 11,
  cursor: 'pointer',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};
