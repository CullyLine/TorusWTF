'use client';

import { useEffect, useMemo, useRef } from 'react';

export interface AnalyserHandle {
  /** Pull a fresh frequency-domain frame into `out`. Returns the bin count. */
  getFrequencyData: (out: Uint8Array) => number;
  /** Pull a fresh time-domain frame into `out`. Returns the sample count. */
  getTimeDomainData: (out: Uint8Array) => number;
  /** Number of FFT bins available (= analyserNode.frequencyBinCount). */
  fftBinCount: number;
}

/**
 * Attaches a Web Audio API AnalyserNode to the given <audio> element.
 * Returns a handle whose `getFrequencyData()` / `getTimeDomainData()` can be
 * called inside a useFrame loop without re-allocating buffers.
 */
export function useAudioAnalyser(
  audio: HTMLAudioElement | null,
  fftSize: 256 | 512 | 1024 | 2048 = 1024,
): AnalyserHandle | null {
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  useEffect(() => {
    if (!audio || typeof window === 'undefined') return;
    if (typeof window.AudioContext === 'undefined') return;

    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const source = ctx.createMediaElementSource(audio);
    sourceRef.current = source;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = 0.78;
    analyserRef.current = analyser;
    source.connect(analyser);
    analyser.connect(ctx.destination);

    const resume = () => {
      if (ctx.state === 'suspended') void ctx.resume();
    };
    audio.addEventListener('play', resume);

    return () => {
      audio.removeEventListener('play', resume);
      source.disconnect();
      analyser.disconnect();
      void ctx.close();
      ctxRef.current = null;
      analyserRef.current = null;
      sourceRef.current = null;
    };
  }, [audio, fftSize]);

  const handle = useMemo<AnalyserHandle | null>(() => {
    return {
      getFrequencyData: (out) => {
        const a = analyserRef.current;
        if (!a) return 0;
        // Web Audio API expects Uint8Array<ArrayBuffer>; our generic Uint8Array
        // buffer is compatible at runtime — cast required for TS variance.
        a.getByteFrequencyData(out as Uint8Array<ArrayBuffer>);
        return a.frequencyBinCount;
      },
      getTimeDomainData: (out) => {
        const a = analyserRef.current;
        if (!a) return 0;
        a.getByteTimeDomainData(out as Uint8Array<ArrayBuffer>);
        return a.frequencyBinCount;
      },
      get fftBinCount() {
        return analyserRef.current?.frequencyBinCount ?? fftSize / 2;
      },
    };
  }, [fftSize]);

  return handle;
}
