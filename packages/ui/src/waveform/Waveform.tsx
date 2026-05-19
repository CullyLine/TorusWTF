'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type { PeaksJson, WaveformPalette } from '@torus/shared';
import { WaveformOptionsMenu } from './WaveformOptionsMenu';

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
  /** Known duration from the server (seconds). Used until audio metadata loads. */
  durationSec?: number;
  /** When true, top 85% shows `visualizerSlot`; bottom 15% keeps the 2D waveform. */
  visualizerEnabled?: boolean;
  onVisualizerEnabledChange?: (enabled: boolean) => void;
  /** Rendered in the upper band when `visualizerEnabled` (pass VisualizerCanvas from the app). */
  visualizerSlot?: ReactNode;
  /** Show "Enable 3D visualizer" in the options menu. */
  visualizerAvailable?: boolean;
  /** Fullscreen theater: 3D fills the viewport; waveform band docks to the bottom. */
  visualizerTheater?: boolean;
  /** Fade theater chrome (preset menu + bottom waveform) after idle. */
  theaterOverlayVisible?: boolean;
  onTheaterOverlayActivity?: () => void;
  canManageClip?: boolean;
  onEditDetails?: () => void;
  onDeleteClip?: () => void;
}

const DEFAULT_PALETTE: WaveformPalette = {
  bass: '#FF2D95',
  mid: '#22D3CE',
  high: '#F7E08C',
};

const PARTICLE_BUDGET = 64;
const DEFAULT_VOLUME = 0.75;

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
export const Waveform = forwardRef<HTMLAudioElement, WaveformProps>(function Waveform(
  {
    peaks,
    palette = DEFAULT_PALETTE,
    audioUrl,
    spectrogramUrl,
    height = 160,
    particles = true,
    onTimeUpdate,
    durationSec,
    visualizerEnabled = false,
    onVisualizerEnabledChange,
    visualizerSlot,
    visualizerAvailable = false,
    visualizerTheater = false,
    theaterOverlayVisible = true,
    onTheaterOverlayActivity,
    canManageClip,
    onEditDetails,
    onDeleteClip,
  },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  useImperativeHandle(ref, () => audioRef.current as HTMLAudioElement, []);
  const rafRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const playingRef = useRef(false);

  const id = useId();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(() =>
    durationSec && durationSec > 0 ? durationSec : 0,
  );
  const [showSpectrogram, setShowSpectrogram] = useState(false);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const volumeBeforeMuteRef = useRef(DEFAULT_VOLUME);
  const [reducedMotion, setReducedMotion] = useState(false);

  const inlineBandHeight = visualizerEnabled
    ? Math.max(28, Math.round(height * 0.15))
    : height;
  const [theaterBandHeight, setTheaterBandHeight] = useState(72);
  const inTheater = visualizerTheater && visualizerEnabled;

  useEffect(() => {
    if (!inTheater) return;
    const update = () => {
      setTheaterBandHeight(Math.max(56, Math.round(window.innerHeight * 0.14)));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [inTheater]);

  const bandHeight = inTheater ? theaterBandHeight : inlineBandHeight;
  const showOptionsMenu =
    !!spectrogramUrl ||
    visualizerAvailable ||
    (canManageClip && (!!onEditDetails || !!onDeleteClip));

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = volume === 0;
  }, [volume, audioUrl]);

  useEffect(() => {
    if (durationSec && durationSec > 0) {
      setDuration((d) => (d > 0 ? d : durationSec));
    }
  }, [durationSec]);

  const syncDurationFromAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const d = audio.duration;
    if (Number.isFinite(d) && d > 0) setDuration(d);
  }, []);

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
    const cssHeight = bandHeight;
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
  }, [peaks, palette, bandHeight, currentTime, duration]);

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
        const h = bandHeight;
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
  }, [particles, reducedMotion, peaks, palette, currentTime, duration, bandHeight]);

  useEffect(() => {
    playingRef.current = isPlaying;
  }, [isPlaying]);

  // ---------- Audio element ----------
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    const onTime = () => {
      setCurrentTime(audio.currentTime);
      onTimeUpdate?.(audio.currentTime);
      syncDurationFromAudio();
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', syncDurationFromAudio);
    audio.addEventListener('durationchange', syncDurationFromAudio);
    audio.addEventListener('loadeddata', syncDurationFromAudio);
    audio.addEventListener('canplay', syncDurationFromAudio);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onPause);

    syncDurationFromAudio();

    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', syncDurationFromAudio);
      audio.removeEventListener('durationchange', syncDurationFromAudio);
      audio.removeEventListener('loadeddata', syncDurationFromAudio);
      audio.removeEventListener('canplay', syncDurationFromAudio);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onPause);
    };
  }, [audioUrl, onTimeUpdate, syncDurationFromAudio]);

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
          if (volume > 0) {
            volumeBeforeMuteRef.current = volume;
            setVolume(0);
          } else {
            setVolume(volumeBeforeMuteRef.current || DEFAULT_VOLUME);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume((v) => Math.min(1, Math.round((v + 0.05) * 100) / 100));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume((v) => Math.max(0, Math.round((v - 0.05) * 100) / 100));
          break;
        default:
          break;
      }
    },
    [togglePlay, volume],
  );

  const formatted = useMemo(
    () => ({ now: formatTime(currentTime), total: formatTime(duration) }),
    [currentTime, duration],
  );

  const shellStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    height,
    background: 'rgba(255,255,255,0.02)',
    borderRadius: 8,
    overflow: 'hidden',
  };

  const bandStyle: CSSProperties = inTheater
    ? {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: bandHeight,
        minHeight: 56,
        cursor: 'pointer',
        touchAction: 'none',
        zIndex: 10,
        borderTop: '1px solid rgba(255,255,255,0.12)',
        background: 'rgba(10, 11, 30, 0.42)',
        backdropFilter: 'blur(10px)',
        opacity: theaterOverlayVisible ? 0.88 : 0,
        transition: 'opacity 0.35s ease',
        pointerEvents: theaterOverlayVisible ? 'auto' : 'none',
      }
    : {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: visualizerEnabled ? '15%' : '100%',
        minHeight: visualizerEnabled ? 28 : undefined,
        cursor: 'pointer',
        touchAction: 'none',
        zIndex: 2,
        borderTop: visualizerEnabled ? '1px solid rgba(255,255,255,0.08)' : undefined,
      };

  const waveformBand = (
    <div
      ref={containerRef}
      role="slider"
      aria-label="audio waveform — drag to seek"
      aria-valuemin={0}
      aria-valuemax={duration || 0}
      aria-valuenow={currentTime}
      aria-valuetext={`${formatted.now} of ${formatted.total}`}
      tabIndex={0}
      onPointerDown={(e) => {
        onTheaterOverlayActivity?.();
        onPointerDown(e);
      }}
      onKeyDown={onKeyDown}
      style={bandStyle}
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
  );

  const theaterOverlay =
    inTheater && visualizerSlot ? (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 60,
          background: '#0a0b1e',
        }}
        onPointerMove={onTheaterOverlayActivity}
        onPointerDown={onTheaterOverlayActivity}
        onWheel={onTheaterOverlayActivity}
        onTouchStart={onTheaterOverlayActivity}
      >
        <div style={{ position: 'absolute', inset: 0 }}>{visualizerSlot}</div>
        {waveformBand}
      </div>
    ) : null;

  return (
    <div>
      <div style={shellStyle}>
        {visualizerEnabled && visualizerSlot && !inTheater ? (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '85%',
              zIndex: 0,
              overflow: 'hidden',
            }}
          >
            {visualizerSlot}
          </div>
        ) : null}
        {!inTheater ? waveformBand : null}
        {inTheater ? (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              opacity: 0.35,
            }}
          >
            Theater mode
          </div>
        ) : null}
      </div>
      {theaterOverlay}

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
        {showOptionsMenu ? (
          <WaveformOptionsMenu
            spectrogramAvailable={!!spectrogramUrl}
            showSpectrogram={showSpectrogram}
            onShowSpectrogramChange={setShowSpectrogram}
            visualizerAvailable={visualizerAvailable}
            showVisualizer={visualizerEnabled}
            onShowVisualizerChange={onVisualizerEnabledChange}
            canManageClip={canManageClip}
            onEditDetails={onEditDetails}
            onDeleteClip={onDeleteClip}
          />
        ) : null}
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            opacity: 0.8,
          }}
        >
          <span>vol</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(e) => {
              const next = Number(e.target.value) / 100;
              setVolume(next);
              if (next > 0) volumeBeforeMuteRef.current = next;
            }}
            aria-label="Volume"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(volume * 100)}
            style={{ width: 96, accentColor: 'var(--color-torus-mid)' }}
          />
        </label>
      </div>

      {audioUrl ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          id={id}
          crossOrigin={visualizerAvailable ? 'anonymous' : undefined}
        />
      ) : null}
    </div>
  );
});

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
