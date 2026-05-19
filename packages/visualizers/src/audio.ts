'use client';

import { useEffect, useMemo, useRef } from 'react';

export interface AnalyserHandle {
  getFrequencyData: (out: Uint8Array) => number;
  getTimeDomainData: (out: Uint8Array) => number;
  fftBinCount: number;
}

interface AudioGraph {
  ctx: AudioContext;
  source: MediaElementAudioSourceNode;
  analyser: AnalyserNode;
}

/** One Web Audio graph per <audio> element — required because createMediaElementSource only works once. */
const graphByAudio = new WeakMap<HTMLAudioElement, AudioGraph>();

function ensureGraph(audio: HTMLAudioElement, fftSize: number): AudioGraph {
  const existing = graphByAudio.get(audio);
  if (existing) {
    if (existing.analyser.fftSize !== fftSize) existing.analyser.fftSize = fftSize;
    return existing;
  }

  const ctx = new AudioContext();
  const source = ctx.createMediaElementSource(audio);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = fftSize;
  analyser.smoothingTimeConstant = 0.78;
  source.connect(analyser);
  analyser.connect(ctx.destination);
  const graph = { ctx, source, analyser };
  graphByAudio.set(audio, graph);
  return graph;
}

/**
 * Attaches a Web Audio API AnalyserNode to the given <audio> element.
 * The graph persists for the element lifetime so toggling the 3D visualizer on/off
 * does not break playback.
 */
export function useAudioAnalyser(
  audio: HTMLAudioElement | null,
  fftSize: 256 | 512 | 1024 | 2048 = 1024,
): AnalyserHandle | null {
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!audio || typeof window === 'undefined') return;
    if (typeof window.AudioContext === 'undefined') return;

    const graph = ensureGraph(audio, fftSize);
    analyserRef.current = graph.analyser;

    const resume = () => {
      if (graph.ctx.state === 'suspended') void graph.ctx.resume();
    };
    audio.addEventListener('play', resume);

    return () => {
      audio.removeEventListener('play', resume);
      analyserRef.current = null;
    };
  }, [audio, fftSize]);

  const handle = useMemo<AnalyserHandle | null>(() => {
    return {
      getFrequencyData: (out) => {
        const a = analyserRef.current;
        if (!a) return 0;
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

  return audio ? handle : null;
}
