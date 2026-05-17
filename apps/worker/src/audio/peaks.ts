import { spawn } from 'node:child_process';
import type { PeakBin, PeaksJson } from '@torus/shared';

interface PeaksOptions {
  binMs?: number;
}

const DEFAULT_BIN_MS = 50;
const DEFAULT_SAMPLE_RATE = 22_050;

/**
 * Stream raw 16-bit mono PCM at 22.05 kHz out of ffmpeg, then bucket into ~50ms
 * frames. For each frame we record:
 *   - peak RMS (-1..1)
 *   - low/mid/high band energy (0..1) via 3-band FFT
 *
 * Output is a compact PeaksJson — the 2D waveform component (browser) and the
 * server-side OG image renderer both consume this single file.
 */
export async function computePeaks(filePath: string, opts: PeaksOptions = {}): Promise<PeaksJson> {
  const binMs = opts.binMs ?? DEFAULT_BIN_MS;
  const sampleRate = DEFAULT_SAMPLE_RATE;
  const samplesPerBin = Math.round((sampleRate * binMs) / 1000);

  const proc = spawn(
    'ffmpeg',
    ['-v', 'error', '-i', filePath, '-f', 's16le', '-ac', '1', '-ar', String(sampleRate), '-'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const bins: PeakBin[] = [];
  let leftover: Buffer = Buffer.alloc(0);
  let stderr = '';

  proc.stderr.on('data', (b: Buffer) => {
    stderr += b.toString('utf8');
  });

  for await (const chunk of proc.stdout as AsyncIterable<Buffer>) {
    const buf = leftover.length > 0 ? Buffer.concat([leftover, chunk]) : chunk;
    const usableBytes = Math.floor(buf.length / (samplesPerBin * 2)) * samplesPerBin * 2;
    let offset = 0;
    while (offset + samplesPerBin * 2 <= usableBytes) {
      const frame = new Int16Array(buf.buffer, buf.byteOffset + offset, samplesPerBin);
      bins.push(analyzeFrame(frame, sampleRate));
      offset += samplesPerBin * 2;
    }
    leftover = buf.subarray(usableBytes);
  }

  await new Promise<void>((resolve, reject) => {
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg pcm extract failed: ${stderr}`)),
    );
    proc.on('error', reject);
  });

  return {
    version: 1,
    sampleRate,
    binMs,
    bins,
  };
}

/**
 * Single-frame analyzer: RMS-as-peak + 3-band power.
 *
 * Bands (Hz):
 *   - low:  20..250    (sub-bass + bass)
 *   - mid:  250..4000  (vocals + most musical content)
 *   - high: 4000..nyq  (cymbals + air + brightness)
 *
 * The band split is intentionally coarse — we want a strong, perceptually
 * meaningful coloring signal, not a full spectrum analyzer. Three bands map
 * directly onto the brand color palette (bass=magenta, mid=teal, high=gold).
 */
function analyzeFrame(samples: Int16Array, sampleRate: number): PeakBin {
  // RMS
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]! / 32768;
    sumSq += s * s;
  }
  const rms = Math.sqrt(sumSq / samples.length);

  // Naïve Goertzel-style band power: integrate squared output of a few
  // narrow band-pass filters tuned to band-center frequencies. Way cheaper
  // than full FFT for "give me 3 bands" and good enough for visual weight.
  const lowCenters = [60, 120, 180];
  const midCenters = [500, 1000, 2000, 3000];
  const highCenters = [5000, 8000, 10500];

  const low = goertzelGroupPower(samples, sampleRate, lowCenters);
  const mid = goertzelGroupPower(samples, sampleRate, midCenters);
  const high = goertzelGroupPower(samples, sampleRate, highCenters);
  const total = low + mid + high + 1e-9;

  return {
    peak: Number(rms.toFixed(4)),
    low: Number((low / total).toFixed(4)),
    mid: Number((mid / total).toFixed(4)),
    high: Number((high / total).toFixed(4)),
  };
}

function goertzelGroupPower(samples: Int16Array, sampleRate: number, freqs: number[]): number {
  let total = 0;
  for (const f of freqs) total += goertzelPower(samples, sampleRate, f);
  return total / freqs.length;
}

function goertzelPower(samples: Int16Array, sampleRate: number, targetFreq: number): number {
  const k = Math.round((samples.length * targetFreq) / sampleRate);
  const omega = (2 * Math.PI * k) / samples.length;
  const cosine = Math.cos(omega);
  const coeff = 2 * cosine;

  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < samples.length; i++) {
    s0 = samples[i]! / 32768 + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}
