import type { NoteEventTime } from '@spotify/basic-pitch';

/**
 * transcribe.ts — browser-side audio → notes using Spotify's Basic Pitch
 * (TensorFlow.js). Everything runs locally: the file never leaves the machine.
 *
 * The model expects mono audio resampled to 22.05 kHz, so we decode + downmix +
 * resample with an OfflineAudioContext first, then feed the raw samples to the
 * model and convert its frame/onset/contour grids into timed note events.
 */

const MODEL_URL = '/transcriber/model/model.json';
const TARGET_SAMPLE_RATE = 22050;

// Basic Pitch annotation frames: 22050 Hz / 256-sample hop ≈ 86.13 fps.
const FRAME_MS = 1000 / (TARGET_SAMPLE_RATE / 256);

export interface TranscribeOptions {
  /** Note onset sensitivity, 0..1 (higher = fewer, more confident onsets). */
  onsetThreshold: number;
  /** Frame/pitch confidence, 0..1 (higher = stricter). */
  frameThreshold: number;
  /** Drop notes shorter than this many milliseconds. */
  minNoteLengthMs: number;
}

export const DEFAULT_TRANSCRIBE_OPTIONS: TranscribeOptions = {
  onsetThreshold: 0.5,
  frameThreshold: 0.3,
  minNoteLengthMs: 130,
};

/** Decode an audio File and resample it to mono 22.05 kHz samples. */
export async function decodeToMono22k(file: File): Promise<Float32Array> {
  const arrayBuffer = await file.arrayBuffer();

  const Ctx: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const decodeCtx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer);
  } finally {
    void decodeCtx.close();
  }

  const durationSec = decoded.length / decoded.sampleRate;
  const frameCount = Math.max(1, Math.ceil(durationSec * TARGET_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, frameCount, TARGET_SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();

  return rendered.getChannelData(0).slice();
}

/**
 * Run Basic Pitch over an audio File and return timed note events.
 * `onProgress` reports 0..1 across decode (first 10%) + inference (rest).
 */
export async function transcribeFile(
  file: File,
  options: TranscribeOptions,
  onProgress?: (fraction: number) => void,
): Promise<NoteEventTime[]> {
  onProgress?.(0.02);
  const samples = await decodeToMono22k(file);
  onProgress?.(0.1);

  // Lazy import keeps TensorFlow.js out of the initial bundle.
  const { BasicPitch, noteFramesToTime, outputToNotesPoly, addPitchBendsToNoteEvents } =
    await import('@spotify/basic-pitch');

  const basicPitch = new BasicPitch(MODEL_URL);

  const frames: number[][] = [];
  const onsets: number[][] = [];
  const contours: number[][] = [];

  await basicPitch.evaluateModel(
    samples,
    (f: number[][], o: number[][], c: number[][]) => {
      frames.push(...f);
      onsets.push(...o);
      contours.push(...c);
    },
    (pct: number) => {
      onProgress?.(0.1 + pct * 0.88);
    },
  );

  const minNoteLenFrames = Math.max(1, Math.round(options.minNoteLengthMs / FRAME_MS));
  const polyNotes = outputToNotesPoly(
    frames,
    onsets,
    options.onsetThreshold,
    options.frameThreshold,
    minNoteLenFrames,
  );
  const withBends = addPitchBendsToNoteEvents(contours, polyNotes);
  const timed = noteFramesToTime(withBends);
  timed.sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);

  onProgress?.(1);
  return timed;
}

export type { NoteEventTime };
