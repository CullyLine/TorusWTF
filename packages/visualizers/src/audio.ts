'use client';

import { useEffect, useMemo, useRef } from 'react';

export interface AnalyserHandle {
  getFrequencyData: (out: Uint8Array) => number;
  getTimeDomainData: (out: Uint8Array) => number;
  fftBinCount: number;
  /** Audio context sample rate in Hz. Used for Hz <-> FFT bin index math. */
  sampleRate: number;
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

interface StreamGraph {
  ctx: AudioContext;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
}

/** One Web Audio graph per MediaStream. */
const graphByStream = new WeakMap<MediaStream, StreamGraph>();

function ensureStreamGraph(stream: MediaStream, fftSize: number): StreamGraph {
  const existing = graphByStream.get(stream);
  if (existing) {
    if (existing.analyser.fftSize !== fftSize) existing.analyser.fftSize = fftSize;
    return existing;
  }

  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = fftSize;
  analyser.smoothingTimeConstant = 0.78;
  source.connect(analyser);
  const graph = { ctx, source, analyser };
  graphByStream.set(stream, graph);
  return graph;
}

function createAnalyserHandle(
  getAnalyser: () => AnalyserNode | null,
  fftSize: number,
): AnalyserHandle {
  return {
    getFrequencyData: (out) => {
      const a = getAnalyser();
      if (!a) return 0;
      a.getByteFrequencyData(out as Uint8Array<ArrayBuffer>);
      return a.frequencyBinCount;
    },
    getTimeDomainData: (out) => {
      const a = getAnalyser();
      if (!a) return 0;
      a.getByteTimeDomainData(out as Uint8Array<ArrayBuffer>);
      return a.frequencyBinCount;
    },
    get fftBinCount() {
      return getAnalyser()?.frequencyBinCount ?? fftSize / 2;
    },
    get sampleRate() {
      return getAnalyser()?.context.sampleRate ?? 44100;
    },
  };
}

/**
 * Attaches a Web Audio API AnalyserNode to a MediaStream (mic or tab capture).
 */
export function useStreamAnalyser(
  stream: MediaStream | null,
  fftSize: 256 | 512 | 1024 | 2048 = 1024,
): AnalyserHandle | null {
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!stream || typeof window === 'undefined') return;
    if (typeof window.AudioContext === 'undefined') return;

    const graph = ensureStreamGraph(stream, fftSize);
    analyserRef.current = graph.analyser;

    const resume = () => {
      if (graph.ctx.state === 'suspended') void graph.ctx.resume();
    };
    resume();
    stream.getAudioTracks().forEach((track) => {
      track.addEventListener('unmute', resume);
    });

    return () => {
      analyserRef.current = null;
    };
  }, [stream, fftSize]);

  const handle = useMemo<AnalyserHandle | null>(() => {
    return createAnalyserHandle(() => analyserRef.current, fftSize);
  }, [fftSize]);

  return stream ? handle : null;
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
    return createAnalyserHandle(() => analyserRef.current, fftSize);
  }, [fftSize]);

  return audio ? handle : null;
}
