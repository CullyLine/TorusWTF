'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAudioAnalyser, useStreamAnalyser, type AnalyserHandle } from '@torus/visualizers';
import { useMicCapture } from './useMicCapture';
import { useTabCapture } from './useTabCapture';

export type SourceKind = 'file' | 'mic' | 'tab';

export interface FileSourceState {
  kind: 'file';
  fileName: string;
  objectUrl: string;
}

export interface StreamSourceState {
  kind: 'mic' | 'tab';
}

export type SourceState = FileSourceState | StreamSourceState | null;

export function useAudioSource() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [source, setSource] = useState<SourceState>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mic = useMicCapture();
  const tab = useTabCapture();

  const fileStream = useMemo(() => {
    if (source?.kind !== 'file') return null;
    return null;
  }, [source]);

  const activeStream = useMemo(() => {
    if (source?.kind === 'mic') return mic.stream;
    if (source?.kind === 'tab') return tab.stream;
    return fileStream;
  }, [source, mic.stream, tab.stream, fileStream]);

  const streamAnalyser = useStreamAnalyser(activeStream, 1024);
  const fileAnalyser = useAudioAnalyser(
    source?.kind === 'file' ? audioRef.current : null,
    1024,
  );

  const analyser: AnalyserHandle | null =
    source?.kind === 'file' ? fileAnalyser : streamAnalyser;

  const clearSource = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
    if (source?.kind === 'file') {
      URL.revokeObjectURL(source.objectUrl);
    }
    mic.stop();
    tab.stop();
    setSource(null);
    setIsPlaying(false);
    setError(null);
  }, [mic, tab, source]);

  const loadFile = useCallback(
    (file: File) => {
      clearSource();
      const objectUrl = URL.createObjectURL(file);
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.src = objectUrl;
      audio.crossOrigin = 'anonymous';
      audio.loop = false;

      const onPlay = () => setIsPlaying(true);
      const onPause = () => setIsPlaying(false);
      const onEnded = () => setIsPlaying(false);

      audio.addEventListener('play', onPlay);
      audio.addEventListener('pause', onPause);
      audio.addEventListener('ended', onEnded);

      setSource({ kind: 'file', fileName: file.name, objectUrl });
      void audio.play().catch(() => {
        setError('Could not play this file. Try another format.');
      });
    },
    [clearSource],
  );

  const startMic = useCallback(async () => {
    clearSource();
    const stream = await mic.start();
    if (stream) setSource({ kind: 'mic' });
    if (mic.error) setError(mic.error);
  }, [clearSource, mic]);

  const startTab = useCallback(async () => {
    clearSource();
    const stream = await tab.start();
    if (stream) setSource({ kind: 'tab' });
    if (tab.error) setError(tab.error);
  }, [clearSource, tab]);

  const play = useCallback(() => {
    if (source?.kind === 'file' && audioRef.current) {
      void audioRef.current.play();
    }
  }, [source]);

  const pause = useCallback(() => {
    if (source?.kind === 'file' && audioRef.current) {
      audioRef.current.pause();
    }
  }, [source]);

  const togglePlay = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, pause, play]);

  const restartFile = useCallback(async () => {
    if (source?.kind !== 'file' || !audioRef.current) return;
    audioRef.current.currentTime = 0;
    await audioRef.current.play();
  }, [source]);

  const getAudioStreamForExport = useCallback((): MediaStream | null => {
    if (source?.kind === 'file' && audioRef.current) {
      const capture = (
        audioRef.current as HTMLMediaElement & { captureStream?: () => MediaStream }
      ).captureStream?.();
      return capture ?? null;
    }
    if (source?.kind === 'mic') return mic.stream;
    if (source?.kind === 'tab') return tab.stream;
    return null;
  }, [source, mic.stream, tab.stream]);

  useEffect(() => {
    const combinedError = mic.error ?? tab.error;
    if (combinedError) setError(combinedError);
  }, [mic.error, tab.error]);

  useEffect(
    () => () => {
      if (source?.kind === 'file') URL.revokeObjectURL(source.objectUrl);
    },
    [source],
  );

  return {
    audioRef,
    source,
    analyser,
    isPlaying,
    error,
    loadFile,
    startMic,
    startTab,
    clearSource,
    play,
    pause,
    togglePlay,
    restartFile,
    getAudioStreamForExport,
  };
}
