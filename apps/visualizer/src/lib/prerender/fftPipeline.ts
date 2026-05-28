/**
 * Offline FFT pipeline matching Web Audio AnalyserNode defaults.
 *
 * For each video frame (at fps), we slide a Hann-windowed FFT over the
 * mono-mixed audio, convert magnitudes to dB, clamp to the same [-100, -30]
 * range AnalyserNode uses by default, map to 0..255, and apply the same
 * temporal smoothing (smoothingTimeConstant). Output frames are packed
 * contiguously so the SyntheticAnalyser can serve them by index without
 * extra allocations during render.
 *
 * AnalyserNode reference behavior we emulate:
 *  - fftSize:              1024 (matches packages/visualizers/src/audio.ts default)
 *  - frequencyBinCount:    512 (== fftSize / 2)
 *  - smoothingTimeConstant: 0.78 (matches ensureGraph() in audio.ts)
 *  - minDecibels:           -100 (Web Audio default)
 *  - maxDecibels:           -30  (Web Audio default)
 */

import FFT from 'fft.js';

export interface FftPrecomputeOptions {
  /** Source audio. Stereo channels are averaged to mono. */
  buffer: AudioBuffer;
  /** Output video frame rate. */
  fps: number;
  /** Default 1024 to match live AnalyserNode. */
  fftSize?: number;
  /** Default 0.78. */
  smoothingTimeConstant?: number;
  /** Default -100 dB. */
  minDecibels?: number;
  /** Default -30 dB. */
  maxDecibels?: number;
  /** Called occasionally with [0..1] progress so the caller can update UI. */
  onProgress?: (progress: number) => void;
  /** When true, abort returns immediately. */
  isCancelled?: () => boolean;
}

export interface FftPrecomputeResult {
  fftSize: number;
  binCount: number;
  sampleRate: number;
  totalFrames: number;
  freqData: Uint8Array;
  timeData: Uint8Array;
}

const PROGRESS_EVERY = 256;

export async function precomputeFftFrames(
  opts: FftPrecomputeOptions,
): Promise<FftPrecomputeResult> {
  const fftSize = opts.fftSize ?? 1024;
  const smoothing = opts.smoothingTimeConstant ?? 0.78;
  const minDb = opts.minDecibels ?? -100;
  const maxDb = opts.maxDecibels ?? -30;
  const fps = opts.fps;
  const buffer = opts.buffer;
  const sampleRate = buffer.sampleRate;
  const binCount = fftSize >> 1;

  if (fftSize <= 0 || (fftSize & (fftSize - 1)) !== 0) {
    throw new Error('fftSize must be a positive power of two');
  }

  // Mix down to mono for the analyser path. Stereo would double our memory
  // and the live analyser also presents a single channel.
  const mono = mixToMono(buffer);
  const totalFrames = Math.floor((buffer.duration * fps) | 0) + 1;

  const freqData = new Uint8Array(totalFrames * binCount);
  const timeData = new Uint8Array(totalFrames * fftSize);

  // Pre-compute Hann window once.
  const window = new Float64Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fftSize - 1));
  }

  const fft = new FFT(fftSize);
  const fftInput = new Float64Array(fftSize);
  const fftOutput: number[] = fft.createComplexArray();

  // Smoothed magnitudes carried frame-to-frame (linear, not dB).
  const smoothedMag = new Float64Array(binCount);

  // Reusable workspace for one frame's time slice.
  const sampleSlice = new Float64Array(fftSize);

  for (let frame = 0; frame < totalFrames; frame++) {
    if (opts.isCancelled?.()) {
      throw new Error('cancelled');
    }

    // Center the analysis window on the frame's time position. The live
    // AnalyserNode reads from "the most recent fftSize samples" — to match
    // that as closely as possible we sample BACKWARD from the frame's time.
    const centerSample = Math.floor((frame / fps) * sampleRate);
    const startSample = centerSample - fftSize + 1;

    // Fill sample slice + time-domain bytes simultaneously.
    const tdOffset = frame * fftSize;
    for (let i = 0; i < fftSize; i++) {
      const src = startSample + i;
      const v = src >= 0 && src < mono.length ? mono[src]! : 0;
      sampleSlice[i] = v;
      // Time-domain byte: 128 = 0, +127 = +1.0, -128 = -1.0. Match
      // AnalyserNode's getByteTimeDomainData mapping exactly.
      const byte = Math.round(128 + Math.max(-1, Math.min(1, v)) * 127);
      timeData[tdOffset + i] = byte;
    }

    // Apply Hann window then FFT.
    for (let i = 0; i < fftSize; i++) {
      fftInput[i] = sampleSlice[i]! * window[i]!;
    }
    fft.realTransform(fftOutput, fftInput);
    // fft.js fills only the first half of fftOutput for realTransform; that's
    // exactly binCount complex pairs, which is what we want.

    // For each bin, compute magnitude, smooth, convert to dB byte.
    const fdOffset = frame * binCount;
    const fftScale = 1 / fftSize;
    for (let bin = 0; bin < binCount; bin++) {
      const re = fftOutput[bin * 2]!;
      const im = fftOutput[bin * 2 + 1]!;
      const mag = Math.sqrt(re * re + im * im) * fftScale;
      // smoothingTimeConstant blends the previous frame's magnitude with the
      // current frame's. AnalyserNode formula: new = prev * tau + cur * (1 - tau).
      const blended = smoothedMag[bin]! * smoothing + mag * (1 - smoothing);
      smoothedMag[bin] = blended;
      // dB conversion + clamp + map to byte.
      const db = blended > 0 ? 20 * Math.log10(blended) : minDb;
      const clamped = db < minDb ? minDb : db > maxDb ? maxDb : db;
      const byte = Math.round(((clamped - minDb) / (maxDb - minDb)) * 255);
      freqData[fdOffset + bin] = byte;
    }

    if (opts.onProgress && (frame & (PROGRESS_EVERY - 1)) === 0) {
      opts.onProgress(frame / totalFrames);
      // Yield to the UI thread so the page stays responsive during long
      // pre-computes (a 4-minute song at 60fps is ~14k frames).
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  opts.onProgress?.(1);

  return {
    fftSize,
    binCount,
    sampleRate,
    totalFrames,
    freqData,
    timeData,
  };
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) {
    // Caller mutates nothing; we can return the actual channel buffer.
    return buffer.getChannelData(0);
  }
  const out = new Float32Array(buffer.length);
  const n = buffer.numberOfChannels;
  for (let ch = 0; ch < n; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      out[i] = (out[i] ?? 0) + (data[i] ?? 0);
    }
  }
  const inv = 1 / n;
  for (let i = 0; i < out.length; i++) {
    out[i] = (out[i] ?? 0) * inv;
  }
  return out;
}
