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
import {
  createChoreographyState,
  updateChoreography,
  type ChoreographyState,
} from './dsp/choreography';
import {
  createCallResponseState,
  updateCallResponse,
  type CallResponseState,
} from './dsp/callResponse';
import { extractBands } from './dsp/bands';

export interface AudioMetrics {
  bass: number;
  mid: number;
  high: number;
  energy: number;
  beat: number;
  breath: number;
  flow: number;
  /**
   * 0..~1.2 beat-impact envelope: snaps up the instant a hit lands, then
   * decays like a struck bell (~¼s). THE shared "something just hit"
   * signal — smooth enough to drive scale/light/camera directly with zero
   * jitter, punchy enough that every kick drum visibly lands.
   */
  impact: number;
  /**
   * 0..1 slow loudness swell (~⅓s rise, ~2s fall). The scene's breath —
   * grows through choruses and drops, exhales in verses. Drive bloom,
   * exposure, saturation, and scene presence from this.
   */
  swell: number;
  /**
   * 0..1 high-frequency sparkle envelope: pops on hi-hats / cymbals /
   * sibilance and melts over ~½s. Drive glints, rim light, and particle
   * sparkle from this instead of raw `high` flux.
   */
  shimmer: number;
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
  /** 0..1: how energetic/intense the moment feels. Reliable. */
  arousal: number;
  /** -1..1: best-guess warmth (cool < 0 < warm). Heuristic; check confidence. */
  valence: number;
  /** 0..1: confidence in the valence read. Drops on percussive/noisy passages. */
  moodConfidence: number;
  /** 0..1: creature leaning forward to listen as tension climbs. */
  leanIn: number;
  /** 0..1: creature holding still during silence, paying close attention. */
  holdBreath: number;
  /** 0..1: pulses on drop, decays slowly afterward (the exhale). */
  release: number;
  /** 0..1: response to gentle vocal passages. */
  tenderness: number;
  /** Long-EMA arousal in 0..1. The creature's current state of being. */
  moodArousal: number;
  /** Long-EMA valence in -1..1. */
  moodValence: number;
  /**
   * 0..1 phrase-echo impulse train. When the music opens a gap after a
   * phrase, the recorded rhythm of the last bars replays here — the visual
   * answering the music. 0 while the track is speaking.
   */
  echo: number;
  /**
   * 0..1 pre-beat anticipation. Ramps just before each predicted beat and
   * releases on the hit — the inhale before the downbeat.
   */
  gather: number;
  /**
   * 0..1 how locked-together bass/mid/high currently are (sliding
   * correlation). Drops/choruses → 1, breakdowns/solos → 0. Drives the
   * flow-field band blend.
   */
  convergence: number;
}

export const DEFAULT_METRICS: AudioMetrics = {
  bass: 0.15,
  mid: 0.15,
  high: 0.15,
  energy: 0.15,
  beat: 0,
  breath: 0.15,
  flow: 0.15,
  impact: 0,
  swell: 0.15,
  shimmer: 0,
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
  arousal: 0.2,
  valence: 0,
  moodConfidence: 0,
  leanIn: 0,
  holdBreath: 0,
  release: 0,
  tenderness: 0,
  moodArousal: 0.2,
  moodValence: 0,
  echo: 0,
  gather: 0,
  convergence: 0,
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
  /**
   * Dynamic-range expansion. 0 = unchanged. 1 = peaks reach 3x their
   * deviation from the slow baseline. Unlike `reactivity` (Gain) this
   * does NOT raise the quiet baseline, so quiet music stays quiet
   * between hits but punches harder on the hits themselves.
   */
  energy?: number;
  /**
   * Auto-gain (AGC). When true (default) a slow loudness envelope is
   * tracked and the bands are normalized toward a target level, so any
   * song lands in a usable range without cranking `reactivity`. With AGC
   * on, `reactivity` acts as a gentle trim on top. Set false to get the
   * old raw behavior where `reactivity` is the only gain.
   */
  autoGain?: boolean;
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
  energy: energyExpand = 0,
  autoGain = true,
}: {
  analyser: AnalyserHandle | null;
  children: ReactNode;
} & MetricsScales) {
  const metricsRef = useRef<AudioMetrics>({ ...DEFAULT_METRICS });
  const freqBuf = useRef<Uint8Array>(new Uint8Array(1024));
  const prevBass = useRef(0.15);
  const prevEnergy = useRef(0.15);
  // Pulse envelope state (impact / swell / shimmer).
  const impactEnvRef = useRef(0);
  const swellEnvRef = useRef(0.15);
  const shimmerEnvRef = useRef(0);
  const shimmerPrevHighRef = useRef(0.15);
  // Auto-gain state: slow loudness envelope + the smoothed gain it drives.
  const agcEnvRef = useRef(AGC_TARGET);
  const agcGainRef = useRef(1);
  // Stem-detection state.
  const prevHigh = useRef(0.15);
  const prevMid = useRef(0.15);
  const sustainedBass = useRef(0.15);
  const sustainedLead = useRef(0.15);
  // Slow per-band EMA baselines used by the Energy expander.
  const baselineBassRef = useRef(0.15);
  const baselineMidRef = useRef(0.15);
  const baselineHighRef = useRef(0.15);
  const baselineEnergyRef = useRef(0.15);
  const macroState = useRef<MacroState>(createMacroState());
  const choreographyState = useRef<ChoreographyState>(createChoreographyState());
  const callResponseState = useRef<CallResponseState>(createCallResponseState());

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
        const dt = Math.min(delta, 0.1);

        // Smooth raised-cosine crossover bands + perceptual scaling. Energy
        // fades continuously across band edges instead of teleporting, and a
        // continuous full-spectrum "motion" level keeps overall movement
        // alive even when a single band hops.
        const levels = extractBands(freqBuf.current, bins, analyser.sampleRate, {
          bassMaxHz,
          midMaxHz,
          crossoverWidth: BAND_CROSSOVER_WIDTH,
          perceptualExponent: BAND_PERCEPTUAL_EXPONENT,
        });

        // --- Auto-gain (AGC) ---
        // Track a slow loudness envelope of the motion signal and normalize
        // toward a target so any song lands in range. The gain itself moves
        // slowly to avoid audible "pumping." With AGC off, gain stays 1 and
        // `reactivity` is the only gain (legacy behavior).
        let agc = 1;
        if (autoGain) {
          const envAlpha = 1 - Math.exp(-dt / AGC_ENVELOPE_TAU);
          agcEnvRef.current += (levels.full - agcEnvRef.current) * envAlpha;
          // True silence (0 dB output, paused track, dead input) parks the
          // gain at neutral instead of pumping toward AGC_MAX_GAIN. Without
          // this, silence ramps the gain to max and the first sound after
          // it lands multiplied by 3x (+ punch expansion) — the "blows up
          // at exactly 0 dB but fine at 0.01 dB" bug.
          const desired =
            agcEnvRef.current < AGC_SILENCE_LEVEL
              ? 1
              : clamp(
                  AGC_TARGET / Math.max(AGC_FLOOR, agcEnvRef.current),
                  AGC_MIN_GAIN,
                  AGC_MAX_GAIN,
                );
          const gainAlpha = 1 - Math.exp(-dt / AGC_GAIN_TAU);
          agcGainRef.current += (desired - agcGainRef.current) * gainAlpha;
          agc = agcGainRef.current;
        } else {
          agcGainRef.current = 1;
        }

        bass = levels.bass * agc * bassMix * reactivity;
        mid = levels.mid * agc * midMix * reactivity;
        high = levels.high * agc * highMix * reactivity;
        energy = levels.full * agc * reactivity;
        bass = applyCreatureBass(bass, creature);
        mid = applyCreatureMid(mid, creature);
        high = applyCreatureHigh(high, creature);

        // --- Punch expander (dynamic-range expansion) ---
        // Tracks a slow ~1.5s baseline per band, then amplifies the deviation
        // around that baseline so the baseline (quiet passages) stays put
        // while peaks punch harder. A small base amount is always applied so
        // the visualizer feels alive by default; the Energy slider adds more.
        const baseAlpha = Math.min(1, delta / 1.5);
        const expand = 1 + (BASE_PUNCH + energyExpand) * 2;
        baselineBassRef.current += (bass - baselineBassRef.current) * baseAlpha;
        baselineMidRef.current += (mid - baselineMidRef.current) * baseAlpha;
        baselineHighRef.current += (high - baselineHighRef.current) * baseAlpha;
        baselineEnergyRef.current += (energy - baselineEnergyRef.current) * baseAlpha;
        bass = baselineBassRef.current + (bass - baselineBassRef.current) * expand;
        mid = baselineMidRef.current + (mid - baselineMidRef.current) * expand;
        high = baselineHighRef.current + (high - baselineHighRef.current) * expand;
        energy = baselineEnergyRef.current + (energy - baselineEnergyRef.current) * expand;
        bass = Math.max(0, Math.min(METRIC_CEILING, bass));
        mid = Math.max(0, Math.min(METRIC_CEILING, mid));
        high = Math.max(0, Math.min(METRIC_CEILING, high));
        energy = Math.max(0, Math.min(METRIC_CEILING, energy));

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
        // Linear full-spectrum reference (independent of AGC/punch gain) so
        // the vocal-band ratio calibration is stable.
        const restE = avg(freqBuf.current, 0, bins) / 255;
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

    const breathSmooth = Math.min(1, 0.08 * speed);
    const flowSmooth = Math.min(1, 0.12 * speed);
    const dtClamped = Math.min(delta, 0.1);

    // Fast tracker used only for beat onset detection (independent of the
    // output smoothing so beats stay crisp at any smoothness).
    const beat = Math.max(0, bass - prevBass.current - 0.04) * 4.5;
    prevBass.current = lerp(prevBass.current, bass, Math.min(1, 0.35 * speed));
    prevEnergy.current = lerp(prevEnergy.current, energy, Math.min(1, 0.2 * speed));

    // --- Pulse envelopes: the shared musical-motion vocabulary ---
    // Impact: the beat tracker's flux spike is a 1-frame impulse; here it
    // becomes a struck-bell envelope — instant attack, exponential ring-down.
    // Presets that scale/flash/kick from `impact` move fluidly by
    // construction instead of each re-inventing its own decay.
    const impactHit = Math.min(1.2, beat);
    impactEnvRef.current =
      impactHit > impactEnvRef.current
        ? impactHit
        : impactEnvRef.current * Math.exp(-dtClamped / IMPACT_DECAY_TAU);

    // Swell: asymmetric loudness breath — blooms quickly when the track
    // opens up, exhales slowly when it pulls back.
    const swellTarget = Math.min(1, energy * 0.8 + beat * 0.1);
    const swellTau = swellTarget > swellEnvRef.current ? SWELL_RISE_TAU : SWELL_FALL_TAU;
    swellEnvRef.current +=
      (swellTarget - swellEnvRef.current) * (1 - Math.exp(-dtClamped / swellTau));

    // Shimmer: rising-edge detector on the high band (hi-hats, cymbals,
    // sibilance) with a slow melt, plus a floor for sustained hat washes.
    const highTransient = Math.max(0, high - shimmerPrevHighRef.current * 0.75);
    shimmerPrevHighRef.current = high;
    const shimmerTarget = Math.min(1, highTransient * 2.4 + Math.max(0, high - 0.55) * 0.4);
    shimmerEnvRef.current =
      shimmerTarget > shimmerEnvRef.current
        ? shimmerTarget
        : shimmerEnvRef.current * Math.exp(-dtClamped / SHIMMER_DECAY_TAU);

    // Smoothness 0..1 → response rate 1..~0.02. Kept as a per-frame lerp for
    // the secondary signals (drum/vocal/lead/mood) below.
    const smoothClamped = Math.max(0, Math.min(0.99, smoothness));
    const respond = 1 - smoothClamped * 0.98;

    // Asymmetric attack/release envelope for the headline bands. Attack is
    // always quick so hits land; release slows with smoothness so motion
    // glides to rest instead of stalling uniformly. Time-constant based, so
    // it behaves the same regardless of frame rate.
    const attackTau = 0.015 + smoothClamped * 0.06;
    const releaseTau = 0.06 + smoothClamped * 0.85;
    const envFollow = (prevVal: number, target: number): number => {
      const tau = target >= prevVal ? attackTau : releaseTau;
      const a = 1 - Math.exp(-dtClamped / Math.max(1e-4, tau));
      return prevVal + (target - prevVal) * a;
    };

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

    // Compute instantaneous arousal/valence for choreography input.
    const arousalNow = Math.min(
      1,
      energy * 0.5 + Math.min(1, centroidHz / 3000) * 0.3 + drumActivity * 0.2,
    );
    const valenceNow = Math.max(
      -1,
      Math.min(
        1,
        (Math.min(1, centroidHz / 3000) - 0.4) * 0.9 +
          vocalActivity * 0.3 -
          (bassActivity > 0.4 && centroidHz < 800 ? 0.25 : 0),
      ),
    );

    // Choreography — turn signals into intent.
    updateChoreography(
      choreographyState.current,
      {
        tension: macroState.current.tension,
        silence: macroState.current.silence,
        dropEvent: macroState.current.dropEvent,
        arousal: arousalNow,
        valence: valenceNow,
        vocalActivity,
      },
      Math.min(delta, 0.1),
      creature === NEUTRAL_PERSONALITY ? undefined : creature,
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

    // Call and response — phrase echo, pre-beat gather, band convergence.
    updateCallResponse(
      callResponseState.current,
      {
        bass,
        mid,
        high,
        energy,
        beat,
        drumActivity,
        leadActivity,
        vocalActivity,
        silence: macroState.current.silence,
        bpm: bpmNow,
        beatPhase,
        barPhase,
      },
      dtClamped,
    );

    const prev = metricsRef.current;
    metricsRef.current = {
      bass: envFollow(prev.bass, softCap(bass)),
      mid: envFollow(prev.mid, softCap(mid)),
      high: envFollow(prev.high, softCap(high)),
      energy: envFollow(prev.energy, softCap(energy)),
      // Beats are spikes; smoothing them too hard kills the impulse, so we
      // only apply a small fraction of the smoothness.
      beat: lerp(prev.beat, Math.min(METRIC_CEILING, beat), Math.max(respond, 0.4)),
      breath: lerp(prev.breath, bass, breathSmooth),
      flow: lerp(prev.flow, energy, flowSmooth),
      impact: impactEnvRef.current,
      swell: swellEnvRef.current,
      shimmer: shimmerEnvRef.current,
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
      arousal: lerp(prev.arousal, arousalNow, Math.max(respond, 0.05)),
      valence: lerp(prev.valence, valenceNow, Math.max(respond, 0.02)),
      moodConfidence: lerp(
        prev.moodConfidence,
        Math.max(0, 1 - drumActivity * 0.8),
        Math.max(respond, 0.1),
      ),
      leanIn: choreographyState.current.leanIn,
      holdBreath: choreographyState.current.holdBreath,
      release: choreographyState.current.release,
      tenderness: choreographyState.current.tenderness,
      moodArousal: choreographyState.current.moodMemory.arousal,
      moodValence: choreographyState.current.moodMemory.valence,
      echo: callResponseState.current.echo,
      gather: callResponseState.current.gather,
      convergence: callResponseState.current.convergence,
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

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// --- Band extraction tuning ---
// Half-octave-ish crossover fade and a mild perceptual lift so musical
// detail reaches a usable range at sane gain.
const BAND_CROSSOVER_WIDTH = 0.5;
const BAND_PERCEPTUAL_EXPONENT = 0.6;

// --- Auto-gain (AGC) tuning ---
const AGC_TARGET = 0.32; // desired motion level the envelope normalizes toward
const AGC_FLOOR = 0.04; // ignore near-silence so we don't blow up the gain
const AGC_SILENCE_LEVEL = 0.012; // below this the signal is silence — park gain at 1
const AGC_MIN_GAIN = 0.6;
const AGC_MAX_GAIN = 3;
const AGC_ENVELOPE_TAU = 2.5; // seconds — how slowly loudness is tracked
const AGC_GAIN_TAU = 0.6; // seconds — how slowly the gain itself moves

// --- Default punch ---
// Baseline dynamic-range expansion applied even when the Energy slider is 0,
// so the visualizer feels reactive out of the box.
const BASE_PUNCH = 0.3;

// --- Pulse envelope tuning ---
// Impact rings down like a struck bell (~¼s to mostly-quiet). Swell rises
// fast enough to catch a chorus opening but exhales over ~2s so loud
// sections read as sustained presence, not flicker. Shimmer melts over
// ~½s so hat patterns read as sparkle trails rather than strobing.
const IMPACT_DECAY_TAU = 0.24;
const SWELL_RISE_TAU = 0.3;
const SWELL_FALL_TAU = 2.1;
const SHIMMER_DECAY_TAU = 0.45;

// Soft cap with 10x headroom: lets cranked-up sliders push past the
// "everything looks normal" 0..1 range without ever going NaN/Infinity.
const METRIC_CEILING = 10;
function softCap(v: number): number {
  return Math.max(0, Math.min(METRIC_CEILING, v));
}
