'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { AnalyserHandle } from '@torus/visualizers';

const MIN_BPM = 60;
const MAX_BPM = 180;
const WINDOW_SEC = 8;
const SMOOTH_SEC = 4;

export interface UseBPMResult {
  bpm: number | null;
  confident: boolean;
  /** Mutable ref tracking the smoothed BPM. Read in useFrame loops without re-renders. */
  bpmRef: MutableRefObject<number | null>;
  /** Mutable ref tracking the timestamp (seconds) of the most recent detected onset. */
  lastOnsetRef: MutableRefObject<number>;
}

export function useBPM(analyser: AnalyserHandle | null, enabled: boolean): UseBPMResult {
  const [bpm, setBpm] = useState<number | null>(null);
  const [confident, setConfident] = useState(false);
  const fluxHistory = useRef<number[]>([]);
  const lastEnergy = useRef(0);
  const intervalHistory = useRef<number[]>([]);
  const lastOnset = useRef(0);
  const smoothBpm = useRef<number | null>(null);
  const timeBuf = useRef<Uint8Array>(new Uint8Array(2048));

  // External refs that consumers (AudioMetricsProvider) read inside useFrame
  // to avoid per-render churn. Kept in sync with the React state.
  const bpmRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !analyser) {
      setBpm(null);
      setConfident(false);
      bpmRef.current = null;
      return;
    }

    const sampleMs = 100;
    const id = window.setInterval(() => {
      analyser.getTimeDomainData(timeBuf.current);
      let energy = 0;
      for (let i = 0; i < timeBuf.current.length; i++) {
        const v = (timeBuf.current[i]! - 128) / 128;
        energy += v * v;
      }
      energy /= timeBuf.current.length;
      const flux = Math.max(0, energy - lastEnergy.current);
      lastEnergy.current = energy;
      const now = performance.now() / 1000;

      fluxHistory.current.push(flux);
      const maxSamples = Math.ceil((WINDOW_SEC * 1000) / sampleMs);
      if (fluxHistory.current.length > maxSamples) {
        fluxHistory.current.shift();
      }

      const threshold = 0.008 + fluxHistory.current.reduce((a, b) => a + b, 0) / fluxHistory.current.length * 1.4;
      if (flux > threshold && now - lastOnset.current > 0.22) {
        const dt = now - lastOnset.current;
        if (lastOnset.current > 0 && dt > 0.28 && dt < 1.2) {
          intervalHistory.current.push(dt);
          if (intervalHistory.current.length > 24) intervalHistory.current.shift();
        }
        lastOnset.current = now;
      }

      if (intervalHistory.current.length < 4) {
        setConfident(false);
        return;
      }

      const intervals = intervalHistory.current;
      let bestBpm = 120;
      let bestScore = 0;
      for (let candidate = MIN_BPM; candidate <= MAX_BPM; candidate++) {
        const period = 60 / candidate;
        let score = 0;
        for (const dt of intervals) {
          const ratio = dt / period;
          const nearest = Math.round(ratio);
          const err = Math.abs(ratio - nearest);
          if (err < 0.12) score += 1 - err;
        }
        if (score > bestScore) {
          bestScore = score;
          bestBpm = candidate;
        }
      }

      const confidence = bestScore / intervals.length;
      setConfident(confidence > 0.35);
      if (confidence <= 0.2) return;

      if (smoothBpm.current == null) {
        smoothBpm.current = bestBpm;
      } else {
        const alpha = Math.min(1, (sampleMs / 1000) / SMOOTH_SEC);
        smoothBpm.current = smoothBpm.current * (1 - alpha) + bestBpm * alpha;
      }
      const rounded = Math.round(smoothBpm.current);
      bpmRef.current = rounded;
      setBpm(rounded);
    }, sampleMs);

    return () => clearInterval(id);
  }, [analyser, enabled]);

  return useMemo(
    () => ({ bpm, confident, bpmRef, lastOnsetRef: lastOnset }),
    [bpm, confident],
  );
}
