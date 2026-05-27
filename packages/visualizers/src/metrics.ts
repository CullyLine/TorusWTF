'use client';

import {
  createContext,
  createElement,
  useContext,
  useRef,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
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
import { createMacroState, updateMacro, type MacroState } from './dsp/macro';

export interface AudioMetrics {
  bass: number;
  mid: number;
  high: number;
  energy: number;
  beat: number;
  breath: number;
  flow: number;
  /** Detected tempo (whole BPM). null = not enough confidence yet. */
  bpm: number | null;
  /** 0..1 phase within the current beat. Advances even between detected onsets. */
  beatPhase: number;
  /** 0..1 phase within the current 4/4 bar. */
  barPhase: number;
  /** 0..1 "is there drum content right now" — transient bursts in mid/high. */
  drumActivity: number;
  /** 0..1 "is there vocal content" — energy concentrated in vocal formant range. */
  vocalActivity: number;
  /** 0..1 sustained bass-band energy (smoother than `bass`). */
  bassActivity: number;
  /** 0..1 sustained tonal mid+high content (instruments/synths). */
  leadActivity: number;
  /** 0..1: 1 = sustained quiet, 0 = active audio. Honors empty bars. */
  silence: number;
  /** 0..1: rising tension before a drop (sweep, build, snare roll). */
  tension: number;
  /** 0..1: pulses on detected bass drop, decays over ~2 beats. */
  dropEvent: number;
}

export const DEFAULT_METRICS: AudioMetrics = {
  bass: 0.15,
  mid: 0.15,
  high: 0.15,
  energy: 0.15,
  beat: 0,
  breath: 0.15,
  flow: 0.15,
  bpm: null,
  beatPhase: 0,
  barPhase: 0,
  drumActivity: 0,
  vocalActivity: 0,
  bassActivity: 0,
  leadActivity: 0,
  silence: 0,
  tension: 0,
  dropEvent: 0,
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
  /** Optional BPM ref (from useBPM). Drives metrics.bpm / beatPhase / barPhase. */
  bpmRef?: RefObject<number | null>;
  /** Optional last-onset-timestamp ref (from useBPM). Anchors phase wrapping. */
  lastOnsetRef?: RefObject<number>;
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
  bpmRef,
  lastOnsetRef,
}: {
  analyser: AnalyserHandle | null;
  children: ReactNode;
} & MetricsScales) {
  const metricsRef = useRef<AudioMetrics>({ ...DEFAULT_METRICS });
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const prevBass = useRef(0.15);
  const prevEnergy = useRef(0.15);
  // Stem-detection state.
  const prevHigh = useRef(0.15);
  const prevMid = useRef(0.15);
  const sustainedBass = useRef(0.15);
  const sustainedLead = useRef(0.15);
  const macroState = useRef<MacroState>(createMacroState());

  useFrame((_state, delta) => {
    let bass = 0.15;
    let mid = 0.15;
    let high = 0.15;
    let energy = 0.15;

    // Stem activity scratch.
    let drumActivity = 0;
    let vocalActivity = 0;
    let bassActivity = 0;
    let leadActivity = 0;
    let centroidHz = 0;

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

        // --- Heuristic stem detection (no ML, just band patterns) ---
        // Drums: spectral flux at mid/high — transient bursts (snare, hat).
        const midFlux = Math.max(0, mid - prevMid.current);
        const highFlux = Math.max(0, high - prevHigh.current);
        drumActivity = Math.min(1, (midFlux * 3 + highFlux * 4) * 1.2);

        // Vocals: energy concentrated in vocal formant range (~200-3000Hz).
        // We compute a vocal-band ratio against the rest of the spectrum.
        const vocalLo = Math.max(1, Math.round((200 / nyquist) * bins));
        const vocalHi = Math.max(vocalLo + 1, Math.round((3000 / nyquist) * bins));
        const vocalE = avg(freqBuf.current, vocalLo, vocalHi) / 255;
        const restE = energy > 0.001 ? energy / reactivity : 0.001;
        const vocalRatio = vocalE / Math.max(0.05, restE);
        // Ratio peaks ~1.2-1.5 when vocals dominate; clamp + map to 0..1.
        vocalActivity = Math.min(1, Math.max(0, (vocalRatio - 0.6) * 1.5));

        // Sustained bass: low-passed bass (slow attack/release).
        sustainedBass.current = sustainedBass.current * 0.85 + bass * 0.15;
        bassActivity = Math.min(1, sustainedBass.current);

        // Lead: mid+high tonal content minus vocals (so synths/instruments,
        // not voices). Smoothed so transients don't dominate.
        const tonalNow = Math.min(1, (mid + high * 0.6) * 0.5);
        const leadNow = Math.max(0, tonalNow - vocalActivity * 0.4);
        sustainedLead.current = sustainedLead.current * 0.8 + leadNow * 0.2;
        leadActivity = Math.min(1, sustainedLead.current);

        // Spectral centroid (in Hz) for macro tension detection.
        let centroidSum = 0;
        let magSum = 0;
        for (let i = 0; i < bins; i++) {
          const mag = freqBuf.current[i]! / 255;
          centroidSum += i * mag;
          magSum += mag;
        }
        const centroidBin = magSum > 0.001 ? centroidSum / magSum : 0;
        centroidHz = (centroidBin / bins) * nyquist;

        prevMid.current = mid;
        prevHigh.current = high;
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

    // Macro state update — silence, tension, dropEvent.
    const bpmForMacro = bpmRef?.current ?? null;
    updateMacro(
      macroState.current,
      {
        energy,
        bass,
        high,
        centroidHz,
        drumActivity,
        bpm: bpmForMacro,
      },
      Math.min(delta, 0.1),
      performance.now() / 1000,
    );

    // BPM phase tracking. We tick phase from the most recent detected onset
    // so it stays musical even when there's a brief detection gap.
    const bpmNow = bpmRef?.current ?? null;
    const onsetNow = lastOnsetRef?.current ?? 0;
    let beatPhase = 0;
    let barPhase = 0;
    if (bpmNow && bpmNow > 30 && onsetNow > 0) {
      const beatPeriod = 60 / bpmNow;
      const barPeriod = 4 * beatPeriod;
      const nowSec = performance.now() / 1000;
      const sinceOnset = Math.max(0, nowSec - onsetNow);
      beatPhase = (sinceOnset % beatPeriod) / beatPeriod;
      barPhase = (sinceOnset % barPeriod) / barPeriod;
    }

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
      bpm: bpmNow,
      beatPhase,
      barPhase,
      drumActivity: lerp(prev.drumActivity, drumActivity, Math.max(respond, 0.3)),
      vocalActivity: lerp(prev.vocalActivity, vocalActivity, Math.max(respond, 0.15)),
      bassActivity: lerp(prev.bassActivity, bassActivity, Math.max(respond, 0.2)),
      leadActivity: lerp(prev.leadActivity, leadActivity, Math.max(respond, 0.2)),
      silence: macroState.current.silence,
      tension: macroState.current.tension,
      dropEvent: macroState.current.dropEvent,
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
