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

export function AudioMetricsProvider({
  analyser,
  children,
}: {
  analyser: AnalyserHandle | null;
  children: ReactNode;
}) {
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
        const s1 = Math.floor(bins * 0.08);
        const s2 = Math.floor(bins * 0.35);
        bass = avg(freqBuf.current, 0, s1) / 255;
        mid = avg(freqBuf.current, s1, s2) / 255;
        high = avg(freqBuf.current, s2, bins) / 255;
        energy = avg(freqBuf.current, 0, bins) / 255;
      }
    }

    const beat = Math.max(0, bass - prevBass.current - 0.04) * 4.5;
    prevBass.current = lerp(prevBass.current, bass, 0.35);
    prevEnergy.current = lerp(prevEnergy.current, energy, 0.2);

    metricsRef.current = {
      bass,
      mid,
      high,
      energy,
      beat: Math.min(1, beat),
      breath: lerp(metricsRef.current.breath, bass, 0.08),
      flow: lerp(metricsRef.current.flow, energy, 0.12),
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
