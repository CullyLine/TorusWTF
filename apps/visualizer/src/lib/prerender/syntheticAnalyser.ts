/**
 * Synthetic AnalyserHandle that serves precomputed FFT + time-domain frames
 * by frame index, instead of reading from a live AudioContext. Used by the
 * offline pre-render pipeline so the visualizer code can run identically
 * for live preview and offline encoding.
 *
 * Frame layout is row-major:
 *   freqData[frame * binCount + bin]
 *   timeData[frame * fftSize + sample]
 */

import type { AnalyserHandle } from '@torus/visualizers';

export interface SyntheticAnalyserOptions {
  fftSize: number;
  binCount: number; // == fftSize / 2 for real input
  sampleRate: number;
  totalFrames: number;
  freqData: Uint8Array; // length = totalFrames * binCount
  timeData: Uint8Array; // length = totalFrames * fftSize (raw waveform bytes, 128 = silence)
}

export interface SyntheticAnalyser extends AnalyserHandle {
  /** Index of the frame served by the next get* call. */
  currentFrameIndex: number;
  readonly totalFrames: number;
}

export function createSyntheticAnalyser(opts: SyntheticAnalyserOptions): SyntheticAnalyser {
  const { fftSize, binCount, sampleRate, totalFrames, freqData, timeData } = opts;

  const handle: SyntheticAnalyser = {
    currentFrameIndex: 0,
    totalFrames,
    fftBinCount: binCount,
    sampleRate,
    getFrequencyData(out) {
      const frame = Math.max(0, Math.min(totalFrames - 1, handle.currentFrameIndex));
      const offset = frame * binCount;
      const n = Math.min(out.length, binCount);
      for (let i = 0; i < n; i++) {
        out[i] = freqData[offset + i]!;
      }
      return binCount;
    },
    getTimeDomainData(out) {
      const frame = Math.max(0, Math.min(totalFrames - 1, handle.currentFrameIndex));
      const offset = frame * fftSize;
      // Time-domain bytes for AnalyserNode have length = fftSize, but consumers
      // pass a Uint8Array sized to fftBinCount in most cases; copy as many as
      // fit and return binCount as the "valid length" for parity with the live
      // analyser's getTimeDomainData return value.
      const n = Math.min(out.length, fftSize);
      for (let i = 0; i < n; i++) {
        out[i] = timeData[offset + i]!;
      }
      return binCount;
    },
  };

  return handle;
}
