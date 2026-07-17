'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAudioAnalyser, useStreamAnalyser, type AnalyserHandle } from '@torus/visualizers';
import { VOLUME_KEY } from '@/lib/storage';
import { useMicCapture } from './useMicCapture';
import { useTabCapture, type DesktopCaptureMode } from './useTabCapture';

const DEFAULT_VOLUME = 0.4;

function readInitialVolume(): number {
  if (typeof window === 'undefined') return DEFAULT_VOLUME;
  const raw = window.localStorage.getItem(VOLUME_KEY);
  if (raw === null) return DEFAULT_VOLUME;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_VOLUME;
  return Math.max(0, Math.min(1, parsed));
}

export type SourceKind = 'file' | 'mic' | 'tab' | 'youtube';

export interface FileSourceState {
  kind: 'file';
  fileName: string;
  objectUrl: string;
  isRemote?: boolean;
  sourceLink?: string;
}

export interface StreamSourceState {
  kind: 'mic' | 'tab' | 'youtube';
}

export type SourceState = FileSourceState | StreamSourceState | null;

export function useAudioSource() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [source, setSource] = useState<SourceState>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Always start at DEFAULT_VOLUME so SSR HTML matches the client's first
  // paint. Reading localStorage in useState() causes a hydration mismatch
  // when a saved volume differs from the default.
  const [volume, setVolumeState] = useState<number>(DEFAULT_VOLUME);
  const [muted, setMutedState] = useState(false);
  const volumeRef = useRef(volume);
  const mutedRef = useRef(muted);

  useEffect(() => {
    const saved = readInitialVolume();
    if (saved === DEFAULT_VOLUME) return;
    volumeRef.current = saved;
    setVolumeState(saved);
    if (audioRef.current) audioRef.current.volume = saved;
  }, []);

  const mic = useMicCapture();
  const tab = useTabCapture();

  const fileStream = useMemo(() => {
    if (source?.kind !== 'file') return null;
    return null;
  }, [source]);

  const activeStream = useMemo(() => {
    if (source?.kind === 'mic') return mic.stream;
    if (source?.kind === 'tab' || source?.kind === 'youtube') return tab.stream;
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
    if (source?.kind === 'file' && !source.isRemote) {
      URL.revokeObjectURL(source.objectUrl);
    }
    mic.stop();
    tab.stop();
    setSource(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
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
      audio.volume = volumeRef.current;
      audio.muted = mutedRef.current;

      const onPlay = () => setIsPlaying(true);
      const onPause = () => setIsPlaying(false);
      const onEnded = () => setIsPlaying(false);

      audio.addEventListener('play', onPlay);
      audio.addEventListener('pause', onPause);
      audio.addEventListener('ended', onEnded);

      setSource({ kind: 'file', fileName: file.name, objectUrl, isRemote: false });
      void audio.play().catch(() => {
        setError('Could not play this file. Try another format.');
      });
    },
    [clearSource],
  );

  const playUrl = useCallback(
    (
      url: string,
      meta: { title: string; sourceLink?: string },
    ) => {
      clearSource();
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.src = url;
      audio.crossOrigin = 'anonymous';
      audio.loop = false;
      audio.volume = volumeRef.current;
      audio.muted = mutedRef.current;

      const onPlay = () => setIsPlaying(true);
      const onPause = () => setIsPlaying(false);
      const onEnded = () => setIsPlaying(false);

      audio.addEventListener('play', onPlay);
      audio.addEventListener('pause', onPause);
      audio.addEventListener('ended', onEnded);

      setSource({
        kind: 'file',
        fileName: meta.title,
        objectUrl: url,
        isRemote: true,
        sourceLink: meta.sourceLink,
      });
      void audio.play().catch(() => {
        setError('Could not play this track.');
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

  const startTab = useCallback(
    async (mode: DesktopCaptureMode = 'everything') => {
      clearSource();
      const stream = await tab.start(mode);
      if (stream) setSource({ kind: 'tab' });
      if (tab.error) setError(tab.error);
    },
    [clearSource, tab],
  );

  const startYouTube = useCallback(async () => {
    clearSource();
    const stream = await tab.start('currentTab');
    if (stream) setSource({ kind: 'youtube' });
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
    setCurrentTime(0);
    await audioRef.current.play();
  }, [source]);

  const seek = useCallback(
    (time: number) => {
      if (source?.kind !== 'file' || !audioRef.current) return;
      const max = Number.isFinite(audioRef.current.duration) ? audioRef.current.duration : 0;
      const clamped = Math.max(0, Math.min(time, max));
      audioRef.current.currentTime = clamped;
      setCurrentTime(clamped);
    },
    [source],
  );

  const setVolume = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(1, next));
    volumeRef.current = clamped;
    setVolumeState(clamped);
    if (audioRef.current) audioRef.current.volume = clamped;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(VOLUME_KEY, String(clamped));
    }
  }, []);

  const setMuted = useCallback((next: boolean) => {
    mutedRef.current = next;
    setMutedState(next);
    if (audioRef.current) audioRef.current.muted = next;
  }, []);

  const toggleMute = useCallback(() => {
    setMuted(!mutedRef.current);
  }, [setMuted]);

  useEffect(() => {
    if (source?.kind !== 'file') {
      setCurrentTime(0);
      setDuration(0);
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;

    const syncDuration = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    const syncTime = () => setCurrentTime(audio.currentTime);

    audio.addEventListener('loadedmetadata', syncDuration);
    audio.addEventListener('durationchange', syncDuration);
    audio.addEventListener('timeupdate', syncTime);
    syncDuration();
    syncTime();

    return () => {
      audio.removeEventListener('loadedmetadata', syncDuration);
      audio.removeEventListener('durationchange', syncDuration);
      audio.removeEventListener('timeupdate', syncTime);
    };
  }, [source]);

  const getAudioStreamForExport = useCallback((): MediaStream | null => {
    if (source?.kind === 'file' && audioRef.current) {
      const capture = (
        audioRef.current as HTMLMediaElement & { captureStream?: () => MediaStream }
      ).captureStream?.();
      return capture ?? null;
    }
    if (source?.kind === 'mic') return mic.stream;
    if (source?.kind === 'tab' || source?.kind === 'youtube') return tab.stream;
    return null;
  }, [source, mic.stream, tab.stream]);

  useEffect(() => {
    const combinedError = mic.error ?? tab.error;
    if (combinedError) setError(combinedError);
  }, [mic.error, tab.error]);

  useEffect(
    () => () => {
      if (source?.kind === 'file' && !source.isRemote) URL.revokeObjectURL(source.objectUrl);
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
    playUrl,
    startMic,
    startTab,
    startYouTube,
    clearSource,
    play,
    pause,
    togglePlay,
    restartFile,
    seek,
    currentTime,
    duration,
    volume,
    muted,
    setVolume,
    setMuted,
    toggleMute,
    getAudioStreamForExport,
  };
}
