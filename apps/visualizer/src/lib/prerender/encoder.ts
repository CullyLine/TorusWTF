/**
 * WebCodecs + mp4-muxer wrapper for the pre-render pipeline.
 *
 * Pipes encoded H.264 video chunks and AAC audio chunks into an
 * `mp4-muxer` Muxer with an in-memory ArrayBufferTarget, then returns
 * the final MP4 bytes for download.
 *
 * Video frames are composited onto an offscreen 2D canvas first so we
 * can stamp a watermark (free tier) before encoding.
 *
 * Browser support: requires `VideoEncoder` + `AudioEncoder` + `AudioData`.
 * Caller is responsible for feature-detecting before constructing this.
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { drawTitleOverlay, drawWatermark } from '@/lib/compose';
import type { TitleOverlay } from '@/lib/storage';

const AUDIO_BITRATE = 192_000;
const AUDIO_CHUNK_SAMPLES = 1024; // AAC frame size

export interface PrerenderEncoderOptions {
  width: number;
  height: number;
  fps: number;
  videoBitrate: number;
  audioBuffer: AudioBuffer;
  watermark: boolean;
  watermarkImage?: ImageBitmap | null;
  titleOverlay?: TitleOverlay | null;
  unlocked?: boolean;
}

export interface PrerenderEncoder {
  /** Composite the source canvas + watermark + encode as a VideoFrame at the given output frame index. */
  encodeFrame(sourceCanvas: HTMLCanvasElement, frameIndex: number): Promise<void>;
  /** Encode the full audio buffer and finalize the MP4. Returns the final bytes. */
  finalize(): Promise<Uint8Array>;
  /** Abort all encoders without finalizing. Safe to call from a cancel path. */
  cancel(): void;
}

export function isPrerenderSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'VideoEncoder' in window &&
    'AudioEncoder' in window &&
    'AudioData' in window &&
    'VideoFrame' in window
  );
}

export async function createPrerenderEncoder(
  opts: PrerenderEncoderOptions,
): Promise<PrerenderEncoder> {
  const { width, height, fps, videoBitrate, audioBuffer, watermark } = opts;
  const watermarkImage = opts.watermarkImage ?? null;
  const titleOverlay = opts.titleOverlay ?? null;
  const unlocked = opts.unlocked ?? false;
  const sampleRate = audioBuffer.sampleRate;
  const channels = Math.min(2, audioBuffer.numberOfChannels);

  // Codec selection: Baseline for ≤1080p so older players are happy,
  // High profile above that for better quality at the bitrate.
  const videoCodec = width * height <= 1920 * 1080 ? 'avc1.42E01F' : 'avc1.640028';
  const audioCodec = 'mp4a.40.2'; // AAC-LC

  // Sanity-check that the chosen configs are actually supported.
  const videoCheck = await VideoEncoder.isConfigSupported({
    codec: videoCodec,
    width,
    height,
    bitrate: videoBitrate,
    framerate: fps,
  });
  if (!videoCheck.supported) {
    throw new Error(`VideoEncoder does not support config: ${videoCodec} ${width}x${height}`);
  }

  const audioCheck = await AudioEncoder.isConfigSupported({
    codec: audioCodec,
    sampleRate,
    numberOfChannels: channels,
    bitrate: AUDIO_BITRATE,
  });
  if (!audioCheck.supported) {
    throw new Error(`AudioEncoder does not support config: ${audioCodec} ${sampleRate}Hz`);
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    fastStart: 'in-memory',
    video: {
      codec: 'avc',
      width,
      height,
      frameRate: fps,
    },
    audio: {
      codec: 'aac',
      numberOfChannels: channels,
      sampleRate,
    },
    firstTimestampBehavior: 'offset',
  });

  let firstEncoderError: Error | null = null;

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (err) => {
      if (!firstEncoderError) firstEncoderError = err as Error;
    },
  });
  videoEncoder.configure({
    codec: videoCodec,
    width,
    height,
    bitrate: videoBitrate,
    framerate: fps,
    // Force a keyframe at most every 2 seconds for scrub-friendliness.
    // (WebCodecs will also insert one whenever we ask via encode({ keyFrame: true }).)
  });

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => {
      muxer.addAudioChunk(chunk, meta);
    },
    error: (err) => {
      if (!firstEncoderError) firstEncoderError = err as Error;
    },
  });
  audioEncoder.configure({
    codec: audioCodec,
    sampleRate,
    numberOfChannels: channels,
    bitrate: AUDIO_BITRATE,
  });

  // Pre-build the compositing surface and reuse it across frames.
  const compositor = document.createElement('canvas');
  compositor.width = width;
  compositor.height = height;
  const ctx = compositor.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('2D compositing context unavailable');

  let cancelled = false;

  return {
    async encodeFrame(sourceCanvas, frameIndex) {
      if (cancelled) return;
      if (firstEncoderError) throw firstEncoderError;

      // Backpressure: if the encoder queue is too deep, wait for it to drain
      // a bit before stuffing more frames in. Without this, very long songs
      // can blow up memory because we're producing faster than encoding.
      while (videoEncoder.encodeQueueSize > 8) {
        await new Promise<void>((r) => setTimeout(r, 0));
        if (cancelled) return;
      }

      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(sourceCanvas, 0, 0, width, height);
      if (titleOverlay) drawTitleOverlay(ctx, width, height, titleOverlay, unlocked);
      if (watermark) drawWatermark(ctx, width, height, watermarkImage ?? null);

      // VideoFrame timestamp is in microseconds.
      const timestampUsec = Math.round((frameIndex / fps) * 1_000_000);
      const durationUsec = Math.round(1_000_000 / fps);
      const frame = new VideoFrame(compositor, {
        timestamp: timestampUsec,
        duration: durationUsec,
      });
      // Keyframe every ~2 seconds.
      const keyFrame = frameIndex % (fps * 2) === 0;
      videoEncoder.encode(frame, { keyFrame });
      frame.close();
    },

    async finalize() {
      if (cancelled) throw new Error('cancelled');

      // Encode all audio. We do this AFTER video because the muxer with
      // fastStart='in-memory' buffers everything until finalize() anyway,
      // and serializing them keeps memory predictable.
      await encodeAudio(audioBuffer, audioEncoder, channels);

      await videoEncoder.flush();
      await audioEncoder.flush();
      if (firstEncoderError) throw firstEncoderError;

      muxer.finalize();
      videoEncoder.close();
      audioEncoder.close();

      const target = muxer.target as ArrayBufferTarget;
      return new Uint8Array(target.buffer);
    },

    cancel() {
      cancelled = true;
      try {
        videoEncoder.close();
      } catch {
        // already closed / not-configured — ignore
      }
      try {
        audioEncoder.close();
      } catch {
        // ignore
      }
    },
  };
}

/**
 * Convert an AudioBuffer to a series of AudioData chunks and feed them
 * to the encoder in order. f32-planar layout keeps channels separate.
 */
async function encodeAudio(
  buffer: AudioBuffer,
  encoder: AudioEncoder,
  channels: number,
): Promise<void> {
  const totalFrames = buffer.length;
  const sampleRate = buffer.sampleRate;
  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch++) {
    // If the buffer has fewer channels than requested, duplicate the first.
    const idx = Math.min(ch, buffer.numberOfChannels - 1);
    channelData.push(buffer.getChannelData(idx));
  }

  let frameOffset = 0;
  while (frameOffset < totalFrames) {
    const chunkFrames = Math.min(AUDIO_CHUNK_SAMPLES, totalFrames - frameOffset);
    // Pack planar data: [ch0 samples..., ch1 samples...].
    const packed = new Float32Array(chunkFrames * channels);
    for (let ch = 0; ch < channels; ch++) {
      const src = channelData[ch]!;
      const dstOffset = ch * chunkFrames;
      for (let i = 0; i < chunkFrames; i++) {
        packed[dstOffset + i] = src[frameOffset + i] ?? 0;
      }
    }
    const timestampUsec = Math.round((frameOffset / sampleRate) * 1_000_000);
    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfChannels: channels,
      numberOfFrames: chunkFrames,
      timestamp: timestampUsec,
      data: packed,
    });
    encoder.encode(audioData);
    audioData.close();

    frameOffset += chunkFrames;

    // Backpressure for audio queue.
    if (encoder.encodeQueueSize > 32) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }
}
