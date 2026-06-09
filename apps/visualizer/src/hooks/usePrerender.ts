'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { CreaturePersonality, RootState, VisualizerId } from '@torus/visualizers';
import type { WaveformPalette } from '@torus/shared';
import { precomputeFftFrames } from '@/lib/prerender/fftPipeline';
import { prescanBpm } from '@/lib/prerender/bpmPrescan';
import { createSyntheticAnalyser, type SyntheticAnalyser } from '@/lib/prerender/syntheticAnalyser';
import { createPrerenderEncoder, isPrerenderSupported } from '@/lib/prerender/encoder';
import type { BackgroundSettings, TitleOverlay, VisualizerControls } from '@/lib/storage';

export type PrerenderStage =
  | 'idle'
  | 'analyzing-fft'
  | 'analyzing-bpm'
  | 'mounting'
  | 'rendering'
  | 'finalizing'
  | 'done'
  | 'error'
  | 'cancelled';

export interface PrerenderProgress {
  stage: PrerenderStage;
  percent: number;
  currentFrame: number;
  totalFrames: number;
  message?: string;
}

export interface PrerenderStartOptions {
  audioBuffer: AudioBuffer;
  fileName: string;
  preset: VisualizerId;
  palette: WaveformPalette;
  controls: VisualizerControls;
  creature?: CreaturePersonality;
  width: number;
  height: number;
  fps: number;
  videoBitrate: number;
  watermark: boolean;
  titleOverlay?: TitleOverlay | null;
  unlocked?: boolean;
  background?: BackgroundSettings;
}

/**
 * Props that the parent component should spread onto a `<PrerenderRoot />`
 * whenever they are non-null. Becomes non-null between mount and finalize.
 */
export interface PrerenderRootMount {
  active: boolean;
  width: number;
  height: number;
  preset: VisualizerId;
  palette: WaveformPalette;
  controls: VisualizerControls;
  creature?: CreaturePersonality;
  syntheticAnalyser: SyntheticAnalyser;
  bpmRef: MutableRefObject<number | null>;
  lastOnsetRef: MutableRefObject<number>;
  background?: BackgroundSettings;
  onReady: (handle: { state: RootState; canvas: HTMLCanvasElement }) => void;
  onTeardown?: () => void;
}

interface PrerenderHookResult {
  supported: boolean;
  progress: PrerenderProgress;
  rootMount: PrerenderRootMount | null;
  error: string | null;
  /** Resolves `true` when the MP4 was rendered and downloaded successfully. */
  start: (options: PrerenderStartOptions) => Promise<boolean>;
  cancel: () => void;
  reset: () => void;
}

const IDLE: PrerenderProgress = {
  stage: 'idle',
  percent: 0,
  currentFrame: 0,
  totalFrames: 0,
};

export function usePrerender(): PrerenderHookResult {
  const [progress, setProgress] = useState<PrerenderProgress>(IDLE);
  const [rootMount, setRootMount] = useState<PrerenderRootMount | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Browser-capability check resolved after mount so SSR and the first client
  // render agree (`false`) — avoids a hydration mismatch on the export button.
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(isPrerenderSupported());
  }, []);

  const cancelRef = useRef(false);
  const readyResolverRef = useRef<((h: { state: RootState; canvas: HTMLCanvasElement }) => void) | null>(null);
  const inFlightRef = useRef(false);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const reset = useCallback(() => {
    cancelRef.current = false;
    inFlightRef.current = false;
    readyResolverRef.current = null;
    setProgress(IDLE);
    setRootMount(null);
    setError(null);
  }, []);

  const start = useCallback(async (options: PrerenderStartOptions) => {
    if (inFlightRef.current) {
      throw new Error('Prerender already in progress');
    }
    if (!isPrerenderSupported()) {
      const message =
        'Pre-render needs Chrome/Edge or Firefox 130+ (WebCodecs). Use Record export instead.';
      setError(message);
      setProgress({ ...IDLE, stage: 'error', message });
      throw new Error(message);
    }

    inFlightRef.current = true;
    cancelRef.current = false;
    setError(null);

    try {
      // ---- Stage 1: FFT pre-compute ----
      setProgress({
        stage: 'analyzing-fft',
        percent: 0,
        currentFrame: 0,
        totalFrames: 0,
        message: 'Analyzing audio spectrum…',
      });
      const fftResult = await precomputeFftFrames({
        buffer: options.audioBuffer,
        fps: options.fps,
        onProgress: (p) =>
          setProgress((prev) => ({ ...prev, percent: p * 0.35 })),
        isCancelled: () => cancelRef.current,
      });

      // ---- Stage 2: BPM pre-scan ----
      setProgress((prev) => ({
        ...prev,
        stage: 'analyzing-bpm',
        message: 'Detecting beat…',
      }));
      const bpmResult = await prescanBpm({
        buffer: options.audioBuffer,
        onProgress: (p) =>
          setProgress((prev) => ({ ...prev, percent: 0.35 + p * 0.15 })),
        isCancelled: () => cancelRef.current,
      });

      // ---- Stage 3: Build synthetic analyser + refs ----
      const syntheticAnalyser = createSyntheticAnalyser({
        fftSize: fftResult.fftSize,
        binCount: fftResult.binCount,
        sampleRate: fftResult.sampleRate,
        totalFrames: fftResult.totalFrames,
        freqData: fftResult.freqData,
        timeData: fftResult.timeData,
      });

      const bpmRef: MutableRefObject<number | null> = { current: bpmResult.bpm };
      const lastOnsetRef: MutableRefObject<number> = { current: 0 };

      // ---- Stage 4: Mount the offscreen canvas, wait for R3F to be ready ----
      setProgress((prev) => ({
        ...prev,
        stage: 'mounting',
        message: 'Preparing renderer…',
      }));
      const readyHandle = await new Promise<{ state: RootState; canvas: HTMLCanvasElement }>(
        (resolve, reject) => {
          if (cancelRef.current) {
            reject(new Error('cancelled'));
            return;
          }
          readyResolverRef.current = resolve;
          setRootMount({
            active: true,
            width: options.width,
            height: options.height,
            preset: options.preset,
            palette: options.palette,
            controls: options.controls,
            creature: options.creature,
            syntheticAnalyser,
            bpmRef,
            lastOnsetRef,
            background: options.background,
            onReady: (h) => {
              const r = readyResolverRef.current;
              readyResolverRef.current = null;
              r?.(h);
            },
            onTeardown: () => {
              // PrerenderRoot was unmounted before render finished. The
              // orchestrator's own finally block handles cleanup; nothing
              // to do here.
            },
          });
        },
      );

      // Give the browser a frame to ensure the canvas is sized & ready.
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (cancelRef.current) throw new Error('cancelled');

      // ---- Stage 5: Set up encoder ----
      const encoder = await createPrerenderEncoder({
        width: options.width,
        height: options.height,
        fps: options.fps,
        videoBitrate: options.videoBitrate,
        audioBuffer: options.audioBuffer,
        watermark: options.watermark,
        titleOverlay: options.titleOverlay,
        unlocked: options.unlocked,
      });

      // ---- Stage 6: Render + encode every frame ----
      const totalFrames = Math.floor(options.audioBuffer.duration * options.fps);
      setProgress({
        stage: 'rendering',
        percent: 0.5,
        currentFrame: 0,
        totalFrames,
        message: 'Rendering frames…',
      });

      const onsetSeconds = bpmResult.onsetSeconds;
      let onsetCursor = 0;

      for (let frame = 0; frame < totalFrames; frame++) {
        if (cancelRef.current) {
          encoder.cancel();
          throw new Error('cancelled');
        }

        const songTimeSec = frame / options.fps;

        // Advance the onset cursor to the latest onset ≤ songTimeSec.
        while (
          onsetCursor < onsetSeconds.length - 1 &&
          onsetSeconds[onsetCursor + 1]! <= songTimeSec
        ) {
          onsetCursor++;
        }
        const mostRecentOnset =
          onsetSeconds.length > 0 && onsetSeconds[onsetCursor]! <= songTimeSec
            ? onsetSeconds[onsetCursor]!
            : 0;

        // metrics.ts computes (performance.now()/1000 - lastOnsetRef.current)
        // and expects that to equal (songTimeSec - mostRecentOnset). So
        // we shift the ref by the wall-clock delta each frame.
        const wallNowSec = performance.now() / 1000;
        lastOnsetRef.current =
          mostRecentOnset > 0 ? wallNowSec - (songTimeSec - mostRecentOnset) : 0;
        bpmRef.current = bpmResult.bpm;
        syntheticAnalyser.currentFrameIndex = Math.min(
          frame,
          syntheticAnalyser.totalFrames - 1,
        );

        // Drive the R3F render loop one tick at song time. Internally this
        // calls every useFrame callback (AudioMetricsProvider, SceneRig,
        // the active preset) and then renders to the WebGL canvas.
        readyHandle.state.advance(songTimeSec, true);

        // Encode the now-rendered canvas into the MP4.
        await encoder.encodeFrame(readyHandle.canvas, frame);

        // Throttle progress updates and yield to the UI thread.
        if ((frame & 7) === 0) {
          const pct = 0.5 + (frame / Math.max(1, totalFrames)) * 0.48;
          setProgress({
            stage: 'rendering',
            percent: pct,
            currentFrame: frame,
            totalFrames,
            message: `Rendering frame ${frame + 1} / ${totalFrames}`,
          });
          await new Promise<void>((r) => setTimeout(r, 0));
        }
      }

      // ---- Stage 7: Finalize the MP4 (audio encode + mux) ----
      setProgress({
        stage: 'finalizing',
        percent: 0.98,
        currentFrame: totalFrames,
        totalFrames,
        message: 'Finalizing MP4…',
      });
      const bytes = await encoder.finalize();
      if (cancelRef.current) throw new Error('cancelled');

      // ---- Stage 8: Trigger download ----
      // Cast through unknown to satisfy strict lib.dom typing that wants
      // ArrayBuffer (not the broader ArrayBufferLike Uint8Array.buffer has).
      const blob = new Blob([bytes as unknown as BlobPart], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = options.fileName.replace(/\.[^.]+$/, '') || 'torus-wtf';
      a.download = `${safeName}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);

      setProgress({
        stage: 'done',
        percent: 1,
        currentFrame: totalFrames,
        totalFrames,
        message: 'Done.',
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'cancelled') {
        setProgress({ ...IDLE, stage: 'cancelled', message: 'Cancelled.' });
      } else {
        setError(message);
        setProgress((prev) => ({
          ...prev,
          stage: 'error',
          message,
        }));
      }
      return false;
    } finally {
      setRootMount(null);
      inFlightRef.current = false;
    }
  }, []);

  return {
    supported,
    progress,
    rootMount,
    error,
    start,
    cancel,
    reset,
  };
}
