'use client';

import { useCallback, useEffect, useState, type DragEvent } from 'react';
import type { useAudioSource, SourceKind } from '@/hooks/useAudioSource';
import type { Look } from '@/hooks/useLook';
import { usePersistedState } from '@/hooks/usePersistedState';
import type { DesktopCaptureMode } from '@/hooks/useTabCapture';
import { useToast } from '@/hooks/useToast';
import { readAudioTags } from '@/lib/audioMetadata';
import { extractPaletteFromBlob } from '@/lib/extractPalette';
import { isChromium } from '@/lib/palettes';
import { SOURCE_KIND_KEY } from '@/lib/storage';

const AUDIO_FILE_RE = /\.(mp3|wav|flac|ogg|opus|m4a|aac|weba|webm)$/i;

// The transport bar shows the file name, so this doubles as the track's credit.
const DEMO_FILE_NAME = 'Despresso Shots by CullyLine.mp3';

interface UseStudioSourceOptions {
  audio: ReturnType<typeof useAudioSource>;
  look: Pick<Look, 'setPalette' | 'setTitleOverlay'>;
}

/**
 * Choosing where the audio comes from: a file (picked, dropped, or the demo
 * track), the microphone, desktop capture, or a YouTube player.
 */
export function useStudioSource({ audio, look }: UseStudioSourceOptions) {
  const { toast } = useToast();
  const { setPalette, setTitleOverlay } = look;

  // A mic or desktop stream cannot survive a reload, so only `file` is
  // restored. Anything else would name a source that no longer exists.
  const [sourceKind, setSourceKind] = usePersistedState<SourceKind | null>(
    SOURCE_KIND_KEY,
    null,
    (value) => (value === 'file' ? 'file' : null),
  );
  const [demoLoading, setDemoLoading] = useState(false);
  const [desktopGuideOpen, setDesktopGuideOpen] = useState(false);
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);

  // Desktop and YouTube capture need audio from `getDisplayMedia`, which only
  // Chromium provides. Checked after mount so server and client markup agree.
  const [desktopSupported, setDesktopSupported] = useState(false);
  useEffect(() => {
    setDesktopSupported(isChromium());
  }, []);

  /** Fills the title card and palette from a file's embedded tags and cover art. */
  const applyEmbeddedTags = useCallback(
    async (file: File) => {
      const tags = await readAudioTags(file);

      // Never overwrite a title the user has already typed.
      if (tags.title) {
        setTitleOverlay((current) =>
          current.title.trim()
            ? current
            : {
                ...current,
                title: tags.title ?? '',
                subtitle: tags.artist ?? current.subtitle,
                enabled: true,
              },
        );
      }

      if (!tags.cover) return;
      try {
        const blob = new Blob([tags.cover.data as unknown as BlobPart], { type: tags.cover.mime });
        setPalette(await extractPaletteFromBlob(blob));
        toast({ message: 'Palette matched to the cover art', variant: 'success' });
      } catch {
        // Cover art that cannot be decoded leaves the palette as it was.
      }
    },
    [setPalette, setTitleOverlay, toast],
  );

  const loadFile = useCallback(
    (file: File) => {
      const looksLikeAudio = file.type.startsWith('audio/') || AUDIO_FILE_RE.test(file.name);
      if (!looksLikeAudio) {
        toast({
          message: `"${file.name}" is not an audio file torus can read. Try MP3, WAV, FLAC, or OGG.`,
          variant: 'error',
        });
        return;
      }
      setSourceKind('file');
      audio.loadFile(file);
      void applyEmbeddedTags(file);
    },
    [audio, applyEmbeddedTags, setSourceKind, toast],
  );

  const loadDemo = useCallback(async () => {
    if (demoLoading) return;
    setDemoLoading(true);
    try {
      const response = await fetch('/demo.mp3');
      if (!response.ok) throw new Error('fetch failed');
      loadFile(new File([await response.blob()], DEMO_FILE_NAME, { type: 'audio/mpeg' }));
    } catch {
      toast({ message: 'Could not load the demo track', variant: 'error' });
    } finally {
      setDemoLoading(false);
    }
  }, [demoLoading, loadFile, toast]);

  const selectKind = useCallback(
    async (kind: SourceKind) => {
      setSourceKind(kind);
      if (kind === 'mic') await audio.startMic();
    },
    [audio, setSourceKind],
  );

  const startDesktopCapture = useCallback(
    (mode: DesktopCaptureMode) => {
      setDesktopGuideOpen(false);
      setSourceKind('tab');
      void audio.startTab(mode);
    },
    [audio, setSourceKind],
  );

  const clear = useCallback(() => {
    audio.clearSource();
    setSourceKind(null);
  }, [audio, setSourceKind]);

  const closeYouTube = useCallback(() => {
    setYoutubeVideoId(null);
    if (audio.source?.kind === 'youtube') audio.clearSource();
  }, [audio]);

  // A file dropped anywhere on the page loads as the audio source.
  const [dragActive, setDragActive] = useState(false);
  const onDragOver = useCallback((e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDragActive(true);
  }, []);
  const onDragLeave = useCallback((e: DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragActive(false);
  }, []);
  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) loadFile(file);
    },
    [loadFile],
  );

  return {
    kind: sourceKind,
    demoLoading,
    desktopSupported,
    desktopGuideOpen,
    youtubeVideoId,
    dragActive,

    loadFile,
    loadDemo,
    selectKind,
    selectYouTube: () => setSourceKind('youtube'),
    setYoutubeVideoId,
    openDesktopGuide: () => setDesktopGuideOpen(true),
    closeDesktopGuide: () => setDesktopGuideOpen(false),
    startDesktopCapture,
    clear,
    closeYouTube,
    /** Spread onto the page root to accept dropped files. */
    dropHandlers: { onDragOver, onDragLeave, onDrop },
  };
}
