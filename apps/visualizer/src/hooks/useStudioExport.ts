'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Creature } from '@torus/visualizers';
import type { useAudioSource } from '@/hooks/useAudioSource';
import { useExport } from '@/hooks/useExport';
import type { ExportSettings } from '@/hooks/useExportSettings';
import type { Look } from '@/hooks/useLook';
import { usePrerender } from '@/hooks/usePrerender';
import { useToast } from '@/hooks/useToast';
import { bitrateFor, waitForCanvasSize } from '@/lib/export-config';
import { downloadSnapshot, takeSnapshot } from '@/lib/snapshot';

interface UseStudioExportOptions {
  audio: ReturnType<typeof useAudioSource>;
  look: Look;
  settings: ExportSettings;
  /** The live WebGL canvas the visualizer draws to. */
  canvasRef: RefObject<HTMLCanvasElement | null>;
  creature?: Creature['personality'];
}

/**
 * The three ways to get the visuals out of the app:
 *
 * - `startRecording` captures the live canvas in real time with MediaRecorder.
 * - `renderFullTrack` renders an uploaded file offline, frame by frame, to MP4.
 * - `saveSnapshot` saves the current frame as a PNG.
 */
export function useStudioExport({
  audio,
  look,
  settings,
  canvasRef,
  creature,
}: UseStudioExportOptions) {
  const { toast } = useToast();
  const recorder = useExport();
  const prerender = usePrerender();

  // True from just before the recorder starts until it goes idle again. The
  // canvas renders at export size for that whole span. Tying the size to the
  // recording state alone left the first frames at preview size, so a 1080p or
  // 4K export opened on upscaled preview pixels.
  const [armed, setArmed] = useState(false);
  const isRecording = recorder.state === 'recording';

  // Disarm on the trailing edge only. Arming happens while the recorder is
  // still idle, so a plain "is idle" check here would undo it immediately.
  const previousState = useRef(recorder.state);
  useEffect(() => {
    if (previousState.current !== 'idle' && recorder.state === 'idle') setArmed(false);
    previousState.current = recorder.state;
  }, [recorder.state]);

  // A recording of a file ends when the file does.
  useEffect(() => {
    if (!isRecording || audio.source?.kind !== 'file') return;
    const element = audio.audioRef.current;
    if (!element) return;
    const onEnded = () => recorder.stop();
    element.addEventListener('ended', onEnded);
    return () => element.removeEventListener('ended', onEnded);
  }, [isRecording, audio.source, audio.audioRef, recorder]);

  const startRecording = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !audio.source) return;

    try {
      const watermarkImage = await settings.loadWatermarkBitmap();
      await recorder.start({
        glCanvas: canvas,
        audioStream: audio.getAudioStreamForExport(),
        resolution: settings.resolution,
        aspect: settings.aspect,
        fps: settings.fps,
        titleOverlay: look.titleOverlay,
        watermark: settings.watermark.show,
        watermarkImage,
        onBeforeRecord: async () => {
          // Resize the canvas to the export size and wait for it to get there
          // before the first frame is captured.
          setArmed(true);
          await waitForCanvasSize(canvas, settings.size.width, settings.size.height);
          if (audio.source?.kind === 'file') await audio.restartFile();
        },
        onFileEnded: () => recorder.stop(),
        onSaved: () => toast({ message: 'Recording saved to your downloads', variant: 'success' }),
        onSilentCapture: () =>
          toast({
            message: 'Recording without sound because this browser did not share the audio track',
            variant: 'info',
          }),
        onRecordingError: (message) => toast({ message, variant: 'error' }),
      });
    } catch (err) {
      setArmed(false);
      toast({
        message: err instanceof Error ? err.message : 'Could not start recording',
        variant: 'error',
      });
    }
  }, [audio, canvasRef, look.titleOverlay, recorder, settings, toast]);

  const renderFullTrack = useCallback(async () => {
    if (audio.source?.kind !== 'file') return;
    const fileSource = audio.source;
    try {
      // Pause playback so the track is not heard while the offline render runs.
      audio.pause();

      // The object URL covers both uploaded files (blob:) and remote URLs.
      const response = await fetch(fileSource.objectUrl);
      if (!response.ok) throw new Error(`Could not read the audio file (${response.status})`);
      const context = new AudioContext();
      const audioBuffer = await context.decodeAudioData(await response.arrayBuffer());
      void context.close();

      const watermarkImage = await settings.loadWatermarkBitmap();
      const saved = await prerender.start({
        audioBuffer,
        fileName: fileSource.fileName,
        preset: look.preset,
        palette: look.palette,
        controls: look.controls,
        screenEffect: look.screenEffect,
        emitter: look.emitter,
        modMatrix: look.modMatrix,
        creature,
        width: settings.size.width,
        height: settings.size.height,
        fps: settings.fps,
        videoBitrate: bitrateFor(settings.resolution),
        watermark: settings.watermark.show,
        watermarkImage,
        titleOverlay: look.titleOverlay,
        background: look.background,
      });
      if (saved) toast({ message: 'MP4 saved to your downloads', variant: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The render failed';
      if (message !== 'cancelled') toast({ message, variant: 'error' });
    }
  }, [audio, creature, look, prerender, settings, toast]);

  const saveSnapshot = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !audio.source) return;
    try {
      downloadSnapshot(await takeSnapshot(canvas));
      toast({ message: 'Snapshot saved', variant: 'success' });
    } catch {
      toast({ message: 'Could not capture a snapshot', variant: 'error' });
    }
  }, [audio.source, canvasRef, toast]);

  return {
    isRecording,
    /** The recorder has stopped and is assembling the file. */
    isSaving: recorder.state === 'rendering',
    elapsedSec: recorder.elapsedSec,
    /** Render the canvas at export size instead of preview size. */
    renderAtExportSize: isRecording || armed,
    startRecording,
    stopRecording: recorder.stop,
    renderFullTrack,
    saveSnapshot,
    prerender,
  };
}
