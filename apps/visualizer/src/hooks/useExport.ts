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
        chunksRef.current = [];
        const ext = fileExtensionForMime(mime);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `torus-visualizer-${Date.now()}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
        setState('idle');
        setElapsedSec(0);
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
      onBeforeRecord?: () => Promise<void>;
      onFileEnded?: () => void;
    }) => {
      if (state !== 'idle') return;

      const { width, height } = dimensionsFor(opts.resolution, opts.aspect ?? '16:9');
      const watermark = !unlocked;
      const compositor = createCompositor(
        opts.glCanvas,
        width,
        height,
        watermark,
        opts.titleOverlay ?? null,
        unlocked,
      );
      compositorRef.current = compositor;
      compositor.start();

      const mimeType = pickRecorderMimeType();
      const videoStream = compositor.canvas.captureStream(opts.fps);

      const tracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];
      if (opts.audioStream) {
        for (const track of opts.audioStream.getAudioTracks()) {
          tracks.push(track);
        }
      }

      const combined = new MediaStream(tracks);
      const recorder = new MediaRecorder(combined, {
        mimeType,
        videoBitsPerSecond: bitrateFor(opts.resolution),
      });

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorderRef.current = recorder;

      if (opts.onBeforeRecord) await opts.onBeforeRecord();

      recorder.start(250);
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
