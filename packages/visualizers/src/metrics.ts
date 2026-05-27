'use client';

import {
  createContext,
  createElement,
  useContext,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { useFrame } from '@react-three/fiber';
import type { AnalyserHandle } from './audio';
import {
  applyCreatureBass,
  applyCreatureHigh,
  applyCreatureMid,
  NEUTRAL_PERSONALITY,
  type CreaturePersonality,
} from './dsp/creature';

export interface AudioMetrics {
  bass: number;
  mid: number;
  high: number;
  energy: number;
  beat: number;
  breath: number;
  flow: number;
}

export const DEFAULT_METRICS: AudioMetrics = {
  bass: 0.15,
  mid: 0.15,
  high: 0.15,
  energy: 0.15,
  beat: 0,
  breath: 0.15,
  flow: 0.15,
};

const MetricsRefContext = createContext<MutableRefObject<AudioMetrics> | null>(null);

export function useMetricsRef(): MutableRefObject<AudioMetrics> {
  const ctx = useContext(MetricsRefContext);
  if (!ctx) return { current: DEFAULT_METRICS };
  return ctx;
}

export interface MetricsScales {
  reactivity?: number;
  bassMix?: number;
  midMix?: number;
  highMix?: number;
  speed?: number;
  /**
   * 0 = snap to each frame's value (sharp/pointy at high gain).
   * 1 = barely move at all (gooey/floaty).
   * Acts as an exponential easing constant on bass/mid/high/energy/beat.
   */
  smoothness?: number;
  /** Per-browser seeded bias vector. Subtle ±15% tilt on bass/mid/high. */
  creature?: CreaturePersonality;
  /** Upper edge of the bass band in Hz. Default 250Hz. */
  bassMaxHz?: number;
  /** Upper edge of the mid band in Hz. Default 2000Hz. */
  midMaxHz?: number;
}

export function AudioMetricsProvider({
  analyser,
  children,
  reactivity = 1,
  bassMix = 1,
  midMix = 1,
  highMix = 1,
  speed = 1,
  smoothness = 0,
  creature = NEUTRAL_PERSONALITY,
  bassMaxHz = 250,
  midMaxHz = 2000,
}: {
  analyser: AnalyserHandle | null;
  children: ReactNode;
} & MetricsScales) {
  const metricsRef = useRef<AudioMetrics>({ ...DEFAULT_METRICS });
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const prevBass = useRef(0.15);
  const prevEnergy = useRef(0.15);

  useFrame(() => {
    let bass = 0.15;
    let mid = 0.15;
    let high = 0.15;
    let energy = 0.15;

    if (analyser) {
      const bins = analyser.getFrequencyData(freqBuf.current);
      if (bins > 0) {
        const nyquist = analyser.sampleRate / 2;
        // Convert Hz crossovers to bin indices. Clamp to keep bands non-empty.
        const s1 = Math.max(1, Math.min(bins - 2, Math.round((bassMaxHz / nyquist) * bins)));
        const s2 = Math.max(s1 + 1, Math.min(bins - 1, Math.round((midMaxHz / nyquist) * bins)));
        bass = (avg(freqBuf.current, 0, s1) / 255) * bassMix * reactivity;
        mid = (avg(freqBuf.current, s1, s2) / 255) * midMix * reactivity;
        high = (avg(freqBuf.current, s2, bins) / 255) * highMix * reactivity;
        energy = (avg(freqBuf.current, 0, bins) / 255) * reactivity;
        bass = applyCreatureBass(bass, creature);
        mid = applyCreatureMid(mid, creature);
        high = applyCreatureHigh(high, creature);
      }
    }

    const bassSmooth = Math.min(1, 0.35 * speed);
    const energySmooth = Math.min(1, 0.2 * speed);
    const breathSmooth = Math.min(1, 0.08 * speed);
    const flowSmooth = Math.min(1, 0.12 * speed);

    const beat = Math.max(0, bass - prevBass.current - 0.04) * 4.5;
    prevBass.current = lerp(prevBass.current, bass, bassSmooth);
    prevEnergy.current = lerp(prevEnergy.current, energy, energySmooth);

    // Smoothness 0..1 → response rate 1..~0.02 (frame-rate-independent enough
    // at typical 60fps; we treat it as a per-frame lerp factor).
    const smoothClamped = Math.max(0, Math.min(0.99, smoothness));
    const respond = 1 - smoothClamped * 0.98;

    const prev = metricsRef.current;
    metricsRef.current = {
      bass: lerp(prev.bass, softCap(bass), respond),
      mid: lerp(prev.mid, softCap(mid), respond),
      high: lerp(prev.high, softCap(high), respond),
      energy: lerp(prev.energy, softCap(energy), respond),
      // Beats are spikes; smoothing them too hard kills the impulse, so we
      // only apply a small fraction of the smoothness.
      beat: lerp(prev.beat, Math.min(METRIC_CEILING, beat), Math.max(respond, 0.4)),
      breath: lerp(prev.breath, bass, breathSmooth),
      flow: lerp(prev.flow, energy, flowSmooth),
    };
  });

  return createElement(MetricsRefContext.Provider, { value: metricsRef }, children);
}

function avg(buf: Uint8Array, start: number, end: number): number {
  let total = 0;
  for (let i = start; i < end; i++) total += buf[i]!;
  return total / Math.max(1, end - start);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Soft cap with 10x headroom: lets cranked-up sliders push past the
// "everything looks normal" 0..1 range without ever going NaN/Infinity.
const METRIC_CEILING = 10;
function softCap(v: number): number {
  return Math.max(0, Math.min(METRIC_CEILING, v));
}
