'use client';

import { useCallback, useRef, useState } from 'react';
import { createCompositor } from '@/lib/compose';
import {
  bitrateFor,
  dimensionsFor,
  fileExtensionForMime,
  pickRecorderMimeType,
  type AspectRatio,
  type ExportFps,
  type ExportResolution,
} from '@/lib/export-config';
import type { TitleOverlay } from '@/lib/storage';

export type ExportState = 'idle' | 'recording' | 'rendering';

export function useExport(unlocked: boolean) {
  const [state, setState] = useState<ExportState>('idle');
  const [elapsedSec, setElapsedSec] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const compositorRef = useRef<ReturnType<typeof createCompositor> | null>(null);
  const timerRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const onSavedRef = useRef<((fileName: string) => void) | null>(null);
  const failedRef = useRef(false);

  const stop = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    compositorRef.current?.stop();
    compositorRef.current = null;

    const recorder = recorderRef.current;
    recorderRef.current = null;

    if (recorder && recorder.state !== 'inactive') {
      setState('rendering');
      recorder.onstop = () => {
        const mime = recorder.mimeType || 'video/webm';
        const blob = new Blob(chunksRef.current, { type: mime });
        const bytes = blob.size;
        chunksRef.current = [];
        if (failedRef.current || bytes === 0) {
          failedRef.current = false;
          setState('idle');
          setElapsedSec(0);
          return;
        }
        const ext = fileExtensionForMime(mime);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const fileName = `torus-visualizer-${Date.now()}.${ext}`;
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        setState('idle');
        setElapsedSec(0);
        onSavedRef.current?.(fileName);
      };
      recorder.stop();
    } else {
      setState('idle');
      setElapsedSec(0);
    }
  }, []);

  const start = useCallback(
    async (opts: {
      glCanvas: HTMLCanvasElement;
      audioStream: MediaStream | null;
      resolution: ExportResolution;
      aspect?: AspectRatio;
      fps: ExportFps;
      titleOverlay?: TitleOverlay | null;
      watermark?: boolean;
      watermarkImage?: ImageBitmap | null;
      onBeforeRecord?: () => Promise<void>;
      onFileEnded?: () => void;
      onSaved?: (fileName: string) => void;
      /** No audio track made it into the recording. */
      onSilentCapture?: () => void;
      /** The recorder failed part-way through; the file is not trustworthy. */
      onRecordingError?: (message: string) => void;
    }) => {
      if (state !== 'idle') return;

      onSavedRef.current = opts.onSaved ?? null;
      failedRef.current = false;

      const { width, height } = dimensionsFor(opts.resolution, opts.aspect ?? '16:9');
      const watermark = unlocked ? (opts.watermark ?? true) : true;
      const compositor = createCompositor(
        opts.glCanvas,
        width,
        height,
        watermark,
        opts.titleOverlay ?? null,
        unlocked,
        unlocked ? opts.watermarkImage ?? null : null,
      );
      compositorRef.current = compositor;

      let recorder: MediaRecorder;
      try {
        const mimeType = pickRecorderMimeType();
        if (!mimeType) {
          throw new Error(
            'This browser cannot record video. Try Chrome or Edge, or use Export Pre-Rendered Video.',
          );
        }

        compositor.start();

        const videoStream = compositor.canvas.captureStream(opts.fps);

        const tracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];
        const audioTracks = opts.audioStream?.getAudioTracks() ?? [];
        for (const track of audioTracks) tracks.push(track);
        if (audioTracks.length === 0) opts.onSilentCapture?.();

        const combined = new MediaStream(tracks);
        recorder = new MediaRecorder(combined, {
          mimeType,
          videoBitsPerSecond: bitrateFor(opts.resolution),
        });
      } catch (err) {
        compositor.stop();
        compositorRef.current = null;
        setState('idle');
        throw err instanceof Error
          ? err
          : new Error('Could not start recording in this browser.');
      }

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      // Without this a mid-recording failure is silent: the UI keeps showing
      // REC and Stop still downloads a truncated or empty file with a success
      // toast.
      recorder.onerror = (event) => {
        const detail = (event as unknown as { error?: DOMException }).error;
        failedRef.current = true;
        opts.onRecordingError?.(detail?.message || 'Recording failed part-way through.');
        stop();
      };

      recorderRef.current = recorder;

      if (opts.onBeforeRecord) await opts.onBeforeRecord();

      try {
        recorder.start(250);
      } catch (err) {
        compositor.stop();
        compositorRef.current = null;
        recorderRef.current = null;
        setState('idle');
        throw err instanceof Error
          ? err
          : new Error('Could not start recording in this browser.');
      }
      setState('recording');
      setElapsedSec(0);
      timerRef.current = window.setInterval(() => {
        setElapsedSec((s) => s + 1);
      }, 1000);

      if (opts.onFileEnded) {
        const audioTrack = opts.audioStream?.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.addEventListener('ended', () => {
            opts.onFileEnded?.();
            stop();
          });
        }
      }
    },
    [state, stop, unlocked],
  );

  return { state, elapsedSec, start, stop };
}
