/**
 * Synchronous BPM pre-scan over a decoded AudioBuffer.
 *
 * Mirrors the live algorithm in `useBPM.ts` (100ms hop, flux-onset detection,
 * candidate BPM voting) but runs over song time instead of wall-clock time,
 * so the offline render can deterministically drive `bpmRef` and
 * `lastOnsetRef` at every frame.
 *
 * Returns:
 *  - `bpm`: the smoothed BPM at the end of the song (the most-stable
 *    estimate). Null if confidence never crosses the threshold.
 *  - `onsetSeconds`: every onset detected during the scan, in song-time
 *    seconds. The render loop snaps to the most recent onset per frame.
 */

const MIN_BPM = 60;
const MAX_BPM = 180;
const WINDOW_SEC = 8;
const SMOOTH_SEC = 4;
const SAMPLE_MS = 100;
const TIME_BUF_SIZE = 2048;
const ONSET_MIN_GAP = 0.22;
const ONSET_MIN_INTERVAL = 0.28;
const ONSET_MAX_INTERVAL = 1.2;

export interface BpmPrescanResult {
  bpm: number | null;
  confident: boolean;
  onsetSeconds: number[];
}

export interface BpmPrescanOptions {
  buffer: AudioBuffer;
  onProgress?: (progress: number) => void;
  isCancelled?: () => boolean;
}

export async function prescanBpm(opts: BpmPrescanOptions): Promise<BpmPrescanResult> {
  const { buffer } = opts;
  const sampleRate = buffer.sampleRate;
  const mono = mixToMono(buffer);
  const totalSec = buffer.duration;

  const onsetSeconds: number[] = [];
  const fluxHistory: number[] = [];
  const intervalHistory: number[] = [];
  let lastEnergy = 0;
  let lastOnset = 0;
  let smoothBpm: number | null = null;

  const hopSec = SAMPLE_MS / 1000;
  const totalHops = Math.floor(totalSec / hopSec) + 1;
  const maxFluxSamples = Math.ceil((WINDOW_SEC * 1000) / SAMPLE_MS);

  for (let hop = 0; hop < totalHops; hop++) {
    if (opts.isCancelled?.()) throw new Error('cancelled');

    const tSec = hop * hopSec;
    const center = Math.floor(tSec * sampleRate);
    const start = Math.max(0, center - TIME_BUF_SIZE + 1);
    const end = Math.min(mono.length, start + TIME_BUF_SIZE);

    // RMS energy over the window. We compare directly against the same
    // 8-bit-derived energy in useBPM by mapping samples [-1, 1] to the
    // same squared scale (the byte/128 division cancels in the ratio
    // used by flux + threshold).
    let energy = 0;
    let count = 0;
    for (let i = start; i < end; i++) {
      const v = mono[i] ?? 0;
      energy += v * v;
      count++;
    }
    energy = count > 0 ? energy / count : 0;

    const flux = Math.max(0, energy - lastEnergy);
    lastEnergy = energy;

    fluxHistory.push(flux);
    if (fluxHistory.length > maxFluxSamples) fluxHistory.shift();

    const meanFlux =
      fluxHistory.reduce((a, b) => a + b, 0) / Math.max(1, fluxHistory.length);
    const threshold = 0.008 + meanFlux * 1.4;

    if (flux > threshold && tSec - lastOnset > ONSET_MIN_GAP) {
      const dt = tSec - lastOnset;
      if (lastOnset > 0 && dt > ONSET_MIN_INTERVAL && dt < ONSET_MAX_INTERVAL) {
        intervalHistory.push(dt);
        if (intervalHistory.length > 24) intervalHistory.shift();
      }
      lastOnset = tSec;
      onsetSeconds.push(tSec);
    }

    if (intervalHistory.length >= 4) {
      // Vote across candidate BPMs.
      let bestBpm = 120;
      let bestScore = 0;
      for (let candidate = MIN_BPM; candidate <= MAX_BPM; candidate++) {
        const period = 60 / candidate;
        let score = 0;
        for (const interval of intervalHistory) {
          const ratio = interval / period;
          const nearest = Math.round(ratio);
          const err = Math.abs(ratio - nearest);
          if (err < 0.12) score += 1 - err;
        }
        if (score > bestScore) {
          bestScore = score;
          bestBpm = candidate;
        }
      }

      const confidence = bestScore / intervalHistory.length;
      if (confidence > 0.2) {
        if (smoothBpm == null) {
          smoothBpm = bestBpm;
        } else {
          const alpha = Math.min(1, hopSec / SMOOTH_SEC);
          smoothBpm = smoothBpm * (1 - alpha) + bestBpm * alpha;
        }
      }
    }

    if (opts.onProgress && (hop & 31) === 0) {
      opts.onProgress(hop / totalHops);
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  opts.onProgress?.(1);

  // Final confidence = how many intervals snapped to the chosen BPM, judged
  // against the same threshold used live.
  const confident = smoothBpm != null && intervalHistory.length >= 4;
  return {
    bpm: smoothBpm != null ? Math.round(smoothBpm) : null,
    confident,
    onsetSeconds,
  };
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
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
