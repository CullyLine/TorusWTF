'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Logo } from '@torus/ui';
import {
  pickRandomVisualizerPreset,
  VISUALIZERS,
  type Creature,
  type VisualizerId,
} from '@torus/visualizers';
import type { WaveformPalette } from '@torus/shared';
import { loadCreature, rerollCreature } from '@/lib/creatureStorage';
import { AudioControls } from '@/components/AudioControls';
import { AudioSourcePicker } from '@/components/AudioSourcePicker';
import { DesktopAudioGuide } from '@/components/DesktopAudioGuide';
import { FeedbackButton } from '@/components/FeedbackButton';
import { HwAccelBanner } from '@/components/HwAccelBanner';
import { EmptyStateHero } from '@/components/EmptyStateHero';
import { PresetPicker } from '@/components/PresetPicker';
import { Scrubber } from '@/components/Scrubber';
import { ShortcutsModal } from '@/components/ShortcutsModal';
import { BPMIndicator } from '@/components/BPMIndicator';
import { ControlPanel } from '@/components/ControlPanel';
import { ExportPanel } from '@/components/ExportPanel';
import { TitleOverlayPanel } from '@/components/TitleOverlayPanel';
import { PrerenderRoot } from '@/components/PrerenderRoot';
import { UnlockBanner } from '@/components/UnlockBanner';
import { YouTubePanel } from '@/components/YouTubePanel';
import { useAudioSource, type SourceKind } from '@/hooks/useAudioSource';
import type { DesktopCaptureMode } from '@/hooks/useTabCapture';
import { useExport } from '@/hooks/useExport';
import { usePrerender } from '@/hooks/usePrerender';
import { useBPM } from '@/hooks/useBPM';
import { useIdleHide } from '@/hooks/useIdleHide';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useToast } from '@/hooks/useToast';
import { useUnlock } from '@/hooks/useUnlock';
import { DEFAULT_PALETTE, isChromium } from '@/lib/palettes';
import { readAudioTags } from '@/lib/audioMetadata';
import { extractPaletteFromBlob } from '@/lib/extractPalette';
import { captureThumbnailDataUrl, downloadSnapshot, takeSnapshot } from '@/lib/snapshot';
import {
  FREE_MAX_FPS,
  FREE_MAX_RES,
  bitrateFor,
  dimensionsFor,
  isFpsLocked,
  isResolutionLocked,
  type AspectRatio,
  type ExportFps,
  type ExportResolution,
} from '@/lib/export-config';
import {
  CONTROLS_KEY,
  DEFAULT_CONTROLS,
  EXPORT_ASPECT_KEY,
  EXPORT_FPS_KEY,
  EXPORT_RESOLUTION_KEY,
  PALETTE_KEY,
  PRESET_KEY,
  SHOW_BPM_KEY,
  SOURCE_KIND_KEY,
  HERO_SEEN_KEY,
  TITLE_OVERLAY_KEY,
  DEFAULT_TITLE_OVERLAY,
  BACKGROUND_KEY,
  DEFAULT_BACKGROUND,
  WATERMARK_KEY,
  DEFAULT_WATERMARK_SETTINGS,
  THUMBNAIL_STORAGE_BUDGET_BYTES,
  estimateLocalStorageBytes,
  loadSavedPresets,
  persistSavedPresets,
  type SavedPreset,
  type TitleOverlay,
  type BackgroundSettings,
  type VisualizerControls,
  type WatermarkSettings,
} from '@/lib/storage';
import { fileToWatermarkDataUrl, watermarkDataUrlToBitmap } from '@/lib/watermarkImage';

const VisualizerCanvas = dynamic(
  () => import('@torus/visualizers').then((m) => m.VisualizerCanvas),
  { ssr: false },
);

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const AUDIO_FILE_RE = /\.(mp3|wav|flac|ogg|opus|m4a|aac|weba|webm)$/i;

const RESOLUTION_VALUES: readonly ExportResolution[] = ['720p', '1080p', '1440p', '4k'];
const FPS_VALUES: readonly ExportFps[] = [30, 60, 120, 240];
const ASPECT_VALUES: readonly AspectRatio[] = ['16:9', '9:16', '1:1', '4:5'];

export function VisualizerApp() {
  const audio = useAudioSource();
  const unlock = useUnlock();
  const exportHook = useExport(unlock.unlocked);
  const prerender = usePrerender();
  const { toast, prompt } = useToast();

  const [preset, setPreset] = usePersistedState<VisualizerId>(PRESET_KEY, 'flow_field', (v) => {
    // Spectral Tunnel was replaced by Infinite Tunnel in the Flow Field Update.
    if (v === 'spectral_tunnel') return 'infinite_tunnel';
    return typeof v === 'string' && v in VISUALIZERS ? (v as VisualizerId) : undefined;
  });
  const [palette, setPalette] = usePersistedState<WaveformPalette>(PALETTE_KEY, DEFAULT_PALETTE);
  const [controls, setControls] = usePersistedState<VisualizerControls>(
    CONTROLS_KEY,
    DEFAULT_CONTROLS,
    (v) =>
      v && typeof v === 'object'
        ? { ...DEFAULT_CONTROLS, ...(v as Partial<VisualizerControls>) }
        : undefined,
  );
  const [resolution, setResolution] = usePersistedState<ExportResolution>(
    EXPORT_RESOLUTION_KEY,
    FREE_MAX_RES,
    (v) => (RESOLUTION_VALUES.includes(v as ExportResolution) ? (v as ExportResolution) : undefined),
  );
  const [fps, setFps] = usePersistedState<ExportFps>(EXPORT_FPS_KEY, FREE_MAX_FPS, (v) =>
    FPS_VALUES.includes(v as ExportFps) ? (v as ExportFps) : undefined,
  );
  const [aspect, setAspect] = usePersistedState<AspectRatio>(EXPORT_ASPECT_KEY, '16:9', (v) =>
    ASPECT_VALUES.includes(v as AspectRatio) ? (v as AspectRatio) : undefined,
  );
  // Mic/desktop streams can't survive a reload, so only `file` is restored —
  // anything else would claim a source that no longer exists.
  const [sourceKind, setSourceKind] = usePersistedState<SourceKind | null>(
    SOURCE_KIND_KEY,
    null,
    (v) => (v === 'file' ? 'file' : null),
  );
  const [heroCollapsed, setHeroCollapsed] = useState(true);
  const [demoLoading, setDemoLoading] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [presetsVersion, setPresetsVersion] = useState(0);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [showBpm, setShowBpm] = usePersistedState<boolean>(SHOW_BPM_KEY, false);
  const [titleOverlay, setTitleOverlay] = usePersistedState<TitleOverlay>(
    TITLE_OVERLAY_KEY,
    DEFAULT_TITLE_OVERLAY,
  );
  const [background, setBackground] = usePersistedState<BackgroundSettings>(
    BACKGROUND_KEY,
    DEFAULT_BACKGROUND,
  );
  const [watermark, setWatermark] = usePersistedState<WatermarkSettings>(
    WATERMARK_KEY,
    DEFAULT_WATERMARK_SETTINGS,
  );
  const [desktopGuideOpen, setDesktopGuideOpen] = useState(false);
  const [desktopSupported, setDesktopSupported] = useState(false);
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const [creature, setCreature] = useState<Creature | null>(null);

  useEffect(() => {
    setDesktopSupported(isChromium());
  }, []);

  // First visit: open with the product intro. Returning visitors land
  // straight in the studio.
  useEffect(() => {
    try {
      if (!localStorage.getItem(HERO_SEEN_KEY)) setHeroCollapsed(false);
    } catch {
      // localStorage unavailable — stay in studio mode.
    }
  }, []);

  const collapseHero = useCallback(() => {
    setHeroCollapsed(true);
    try {
      localStorage.setItem(HERO_SEEN_KEY, '1');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const c = loadCreature();
    setCreature(c);
    if (typeof window === 'undefined') return;
    const w = window as unknown as {
      __torus?: { creature: Creature; rerollCreature: () => Creature };
    };
    const handle = {
      creature: c,
      rerollCreature: () => {
        const fresh = rerollCreature();
        setCreature(fresh);
        if (w.__torus) w.__torus.creature = fresh;
        return fresh;
      },
    };
    w.__torus = handle;
  }, []);

  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  useEffect(() => {
    if (!reducedMotion) return;
    setControls((c) => ({
      ...c,
      reactivity: Math.min(c.reactivity, 0.4),
      bloomIntensity: Math.min(c.bloomIntensity, 0.7),
    }));
  }, [reducedMotion, setControls]);

  useEffect(() => {
    if (unlock.checking || unlock.unlocked) return;
    if (isResolutionLocked(resolution, false)) setResolution(FREE_MAX_RES);
    if (isFpsLocked(fps, false)) setFps(FREE_MAX_FPS);
  }, [unlock.checking, unlock.unlocked, resolution, fps, setResolution, setFps]);

  const handleSelectKind = useCallback(
    async (kind: SourceKind) => {
      setSourceKind(kind);
      if (kind === 'mic') await audio.startMic();
    },
    [audio, setSourceKind],
  );

  // Desktop always goes through the chooser — it's the mode selector
  // (everything vs. one application), not a one-time tutorial.
  const handleDesktopSelect = useCallback(() => {
    setDesktopGuideOpen(true);
  }, []);

  const handleDesktopPick = useCallback(
    (mode: DesktopCaptureMode) => {
      setDesktopGuideOpen(false);
      setSourceKind('tab');
      void audio.startTab(mode);
    },
    [audio, setSourceKind],
  );

  // Collapse the hero before showing the player — if the layout swapped while
  // the embed was playing, the iframe would remount and playback would die.
  const handleYouTubeSelect = useCallback(() => {
    collapseHero();
    setSourceKind('youtube');
  }, [collapseHero, setSourceKind]);

  const handleYouTubeLoad = useCallback(
    (videoId: string) => {
      collapseHero();
      setYoutubeVideoId(videoId);
    },
    [collapseHero],
  );

  const handleYouTubeCapture = useCallback(() => {
    void audio.startYouTube();
  }, [audio]);

  // Stop just the capture — the embed keeps playing so the user can re-capture.
  const handleYouTubeStopCapture = useCallback(() => {
    audio.clearSource();
  }, [audio]);

  const handleYouTubeClose = useCallback(() => {
    setYoutubeVideoId(null);
    if (audio.source?.kind === 'youtube') audio.clearSource();
  }, [audio]);

  const applyEmbeddedTags = useCallback(
    async (file: File) => {
      const tags = await readAudioTags(file);

      // Auto-fill the title card from embedded tags, but never clobber a
      // title the user has already typed.
      if (tags.title) {
        setTitleOverlay((o) =>
          o.title.trim()
            ? o
            : { ...o, title: tags.title ?? '', subtitle: tags.artist ?? o.subtitle, enabled: true },
        );
      }

      if (!tags.cover) return;
      try {
        const blob = new Blob([tags.cover.data as unknown as BlobPart], {
          type: tags.cover.mime,
        });
        const extracted = await extractPaletteFromBlob(blob);
        setPalette(extracted);
        toast({ message: 'Palette matched to the cover art', variant: 'success' });
      } catch {
        // Cover art that can't be decoded just leaves the palette untouched.
      }
    },
    [setPalette, setTitleOverlay, toast],
  );

  const handleFile = useCallback(
    (file: File) => {
      const looksLikeAudio = file.type.startsWith('audio/') || AUDIO_FILE_RE.test(file.name);
      if (!looksLikeAudio) {
        toast({
          message: `"${file.name}" doesn't look like an audio file — try MP3, WAV, FLAC, or OGG.`,
          variant: 'error',
        });
        return;
      }
      setSourceKind('file');
      audio.loadFile(file);
      collapseHero();
      void applyEmbeddedTags(file);
    },
    [audio, applyEmbeddedTags, collapseHero, setSourceKind, toast],
  );

  const handleClearSource = useCallback(() => {
    audio.clearSource();
    setSourceKind(null);
  }, [audio, setSourceKind]);

  const handlePickPaletteImage = useCallback(
    async (file: File) => {
      try {
        const extracted = await extractPaletteFromBlob(file);
        setPalette(extracted);
        toast({ message: `Palette extracted from ${file.name}`, variant: 'success' });
      } catch {
        toast({ message: 'Could not read colors from that image', variant: 'error' });
      }
    },
    [setPalette, toast],
  );

  const handleTryDemo = useCallback(async () => {
    if (demoLoading) return;
    setDemoLoading(true);
    try {
      const res = await fetch('/demo.mp3');
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      // "Scheming Weasel (faster version)" — Kevin MacLeod (incompetech.com),
      // CC BY 3.0. Filename doubles as on-screen attribution.
      handleFile(
        new File([blob], 'Scheming Weasel — Kevin MacLeod.mp3', { type: 'audio/mpeg' }),
      );
    } catch {
      toast({ message: 'Could not load demo audio', variant: 'error' });
    } finally {
      setDemoLoading(false);
    }
  }, [demoLoading, handleFile, toast]);

  // Switching presets applies that preset's hand-tuned slider defaults
  // (from the registry). Omitted fields keep the user's current values, so
  // audio-response tuning survives preset hopping.
  const handlePresetChange = useCallback(
    (id: VisualizerId) => {
      setPreset(id);
      const defaults = VISUALIZERS[id].defaults;
      if (defaults) setControls((c) => ({ ...c, ...defaults }));
    },
    [setControls, setPreset],
  );

  const handleRandomPreset = useCallback(() => {
    handlePresetChange(pickRandomVisualizerPreset());
  }, [handlePresetChange]);

  const handleLoadSaved = useCallback((saved: SavedPreset) => {
    // Legacy saved presets may still point at the removed Spectral Tunnel.
    const presetId =
      (saved.presetId as string) === 'spectral_tunnel' ? 'infinite_tunnel' : saved.presetId;
    setPreset(presetId in VISUALIZERS ? presetId : 'liquid_blob');
    setPalette(saved.palette);
    setControls({
      reactivity: saved.reactivity,
      bassMix: saved.bassMix,
      midMix: saved.midMix,
      highMix: saved.highMix,
      speed: saved.speed,
      smoothness: saved.smoothness ?? 0,
      scale: saved.scale ?? 1,
      bassShake: saved.bassShake ?? 0,
      bassMaxHz: saved.bassMaxHz ?? 250,
      midMaxHz: saved.midMaxHz ?? 2000,
      anima: saved.anima ?? 0.5,
      aura: saved.aura ?? 0.4,
      cinematicSpeed: saved.cinematicSpeed ?? 1,
      energy: saved.energy ?? 0,
      inflate: saved.inflate ?? 0.5,
      appendages: saved.appendages ?? 4,
      subSpheres: saved.subSpheres ?? 6,
      turbulence: saved.turbulence ?? 1,
      trailLength: saved.trailLength ?? 1,
      density: saved.density ?? 1,
      vortexAmount: saved.vortexAmount ?? 0.25,
      interactStrength: saved.interactStrength ?? 1,
      cameraDistance: saved.cameraDistance ?? 1,
      lightLevel: saved.lightLevel ?? 1,
      autoGain: saved.autoGain ?? true,
      colorLife: saved.colorLife ?? 0.6,
      bloomIntensity: saved.bloomIntensity,
      cameraMode: saved.cameraMode,
    });
  }, []);

  const handleSavePreset = useCallback(async () => {
    if (!unlock.unlocked) return;
    const name = await prompt({
      message: 'Preset name',
      placeholder: 'My preset',
      confirmLabel: 'Save',
    });
    const trimmed = name?.trim();
    if (!trimmed) return;

    let thumbnail: string | undefined;
    const canvas = glCanvasRef.current;
    if (canvas && estimateLocalStorageBytes() < THUMBNAIL_STORAGE_BUDGET_BYTES) {
      try {
        thumbnail = captureThumbnailDataUrl(canvas);
      } catch {
        thumbnail = undefined;
      }
    }

    const saved = loadSavedPresets();
    const entry: SavedPreset = {
      id: crypto.randomUUID(),
      name: trimmed,
      createdAt: new Date().toISOString(),
      thumbnail,
      presetId: preset,
      palette,
      ...controls,
    };
    try {
      persistSavedPresets([entry, ...saved]);
      setPresetsVersion((v) => v + 1);
      toast({ message: `Saved "${trimmed}"`, variant: 'success' });
    } catch {
      // A quota error usually comes from the embedded thumbnail — retry lean.
      const lean = { ...entry };
      delete lean.thumbnail;
      try {
        persistSavedPresets([lean, ...saved]);
        setPresetsVersion((v) => v + 1);
        toast({
          message: `Saved "${trimmed}" without a thumbnail — storage is full`,
          variant: 'info',
        });
      } catch {
        toast({ message: 'Could not save preset', variant: 'error' });
      }
    }
  }, [unlock.unlocked, preset, palette, controls, prompt, toast]);

  const startExport = useCallback(async () => {
    const canvas = glCanvasRef.current;
    if (!canvas || !audio.source) return;

    try {
      const watermarkImage =
        unlock.unlocked && watermark.customImageDataUrl
          ? await watermarkDataUrlToBitmap(watermark.customImageDataUrl)
          : null;
      await exportHook.start({
        glCanvas: canvas,
        audioStream: audio.getAudioStreamForExport(),
        resolution,
        aspect,
        fps,
        titleOverlay,
        watermark: watermark.show,
        watermarkImage,
        onBeforeRecord: async () => {
          if (audio.source?.kind === 'file') {
            await audio.restartFile();
          }
        },
        onFileEnded: () => exportHook.stop(),
        onSaved: () => toast({ message: 'Export saved to your downloads', variant: 'success' }),
      });
    } catch (err) {
      toast({
        message: err instanceof Error ? err.message : 'Could not start recording',
        variant: 'error',
      });
    }
  }, [audio, exportHook, resolution, aspect, fps, titleOverlay, watermark, unlock.unlocked, toast]);

  const handleWatermarkImageFile = useCallback(
    async (file: File) => {
      try {
        const dataUrl = await fileToWatermarkDataUrl(file);
        setWatermark((w) => ({ ...w, customImageDataUrl: dataUrl }));
      } catch {
        toast({ message: 'Could not read that image', variant: 'error' });
      }
    },
    [setWatermark, toast],
  );

  const handleSnapshot = useCallback(async () => {
    const canvas = glCanvasRef.current;
    if (!canvas || !audio.source) return;
    try {
      const blob = await takeSnapshot(canvas);
      downloadSnapshot(blob);
      toast({ message: 'Snapshot saved', variant: 'success' });
    } catch {
      toast({ message: 'Could not capture snapshot', variant: 'error' });
    }
  }, [audio.source, toast]);

  const handlePrerender = useCallback(async () => {
    if (audio.source?.kind !== 'file') return;
    const fileSource = audio.source;
    try {
      // Pause live playback so the user isn't also hearing the song while
      // the offscreen render runs. We resume only if they originally had
      // it playing — but for simplicity we just leave it paused; they
      // can hit play again.
      audio.pause();

      // Fetch + decode the audio. The objectUrl works for both blob: URLs
      // (uploaded files) and remote URLs.
      const res = await fetch(fileSource.objectUrl);
      if (!res.ok) throw new Error(`Failed to fetch audio (${res.status})`);
      const arrayBuffer = await res.arrayBuffer();
      const ctx = new AudioContext();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      void ctx.close();

      const dims = dimensionsFor(resolution, aspect);
      // Free tier always gets the default badge; licensed users control both
      // the toggle and the custom image.
      const watermarkImage =
        unlock.unlocked && watermark.customImageDataUrl
          ? await watermarkDataUrlToBitmap(watermark.customImageDataUrl)
          : null;
      const ok = await prerender.start({
        audioBuffer,
        fileName: fileSource.fileName,
        preset,
        palette,
        controls,
        creature: creature?.personality,
        width: dims.width,
        height: dims.height,
        fps,
        videoBitrate: bitrateFor(resolution),
        watermark: unlock.unlocked ? watermark.show : true,
        watermarkImage,
        titleOverlay,
        unlocked: unlock.unlocked,
        background,
      });
      if (ok) {
        toast({ message: 'MP4 saved to your downloads', variant: 'success' });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Pre-render failed';
      if (message !== 'cancelled') {
        toast({ message, variant: 'error' });
      }
    }
  }, [
    audio,
    aspect,
    controls,
    creature,
    fps,
    palette,
    preset,
    prerender,
    resolution,
    titleOverlay,
    watermark,
    toast,
    unlock.unlocked,
    background,
  ]);

  const exportSize = dimensionsFor(resolution, aspect);
  const isRecording = exportHook.state === 'recording';
  const hasSource = Boolean(audio.source);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const bannerVisible = !unlock.unlocked && !unlock.checking;
  const previewAspect = `${exportSize.width} / ${exportSize.height}`;
  const previewPortrait = aspect === '9:16' || aspect === '4:5';
  // Nothing auto-hides until there's actually audio on screen — a fresh
  // visitor should never watch the controls fade away.
  const { uiVisible: overlayVisible, reveal: revealOverlay, hide: hideOverlay } = useIdleHide({
    forceVisible: isRecording || !hasSource,
  });
  const { uiVisible: sidebarVisible, reveal: revealSidebar, hide: hideSidebar } = useIdleHide({
    forceVisible: isRecording || !hasSource,
    idleMs: 3_000,
  });
  // Run BPM detection whenever there's an audio source, regardless of the
  // BPM-indicator visibility — presets read beat/bar phase from metrics.
  const { bpm, confident, bpmRef, lastOnsetRef } = useBPM(
    audio.analyser,
    Boolean(audio.source),
  );
  const overlayFade = reducedMotion ? '' : 'transition-opacity duration-250';
  const overlayHidden = overlayVisible ? 'opacity-100' : 'opacity-0 pointer-events-none';
  const sidebarFade = reducedMotion ? '' : 'transition-opacity duration-300';
  const sidebarHidden = sidebarVisible ? 'opacity-100' : 'opacity-0 pointer-events-none';

  const revealAll = useCallback(() => {
    revealOverlay();
    revealSidebar();
  }, [revealOverlay, revealSidebar]);

  // When audio arrives on mobile, tuck the sheet away so the visuals win.
  useEffect(() => {
    if (hasSource && isMobile) setMobileControlsOpen(false);
  }, [hasSource, isMobile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space' && audio.source?.kind === 'file') {
        e.preventDefault();
        audio.togglePlay();
      }
      if (e.key === 'f' || e.key === 'F') {
        if (!viewportRef.current) return;
        if (document.fullscreenElement) void document.exitFullscreen();
        else void viewportRef.current.requestFullscreen();
      }
      if (e.key === 'r' || e.key === 'R') {
        handleRandomPreset();
      }
      if (e.key === '?') {
        setShortcutsOpen(true);
      }
      if (audio.source?.kind === 'file') {
        const step = e.shiftKey ? 15 : 5;
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          audio.seek(Math.max(0, audio.currentTime - step));
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          audio.seek(Math.min(audio.duration, audio.currentTime + step));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [audio, handleRandomPreset]);

  useEffect(() => {
    if (!isRecording || audio.source?.kind !== 'file') return;
    const el = audio.audioRef.current;
    if (!el) return;
    const onEnded = () => exportHook.stop();
    el.addEventListener('ended', onEnded);
    return () => el.removeEventListener('ended', onEnded);
  }, [isRecording, audio.source, audio.audioRef, exportHook]);

  useEffect(() => {
    if (!heroCollapsed) return;
    const onMouseOut = (e: MouseEvent) => {
      if (e.relatedTarget === null && !isRecording) {
        hideSidebar();
        hideOverlay();
      }
    };
    document.addEventListener('mouseout', onMouseOut);
    return () => document.removeEventListener('mouseout', onMouseOut);
  }, [heroCollapsed, isRecording, hideOverlay, hideSidebar]);

  const sidebarPanels = (
    <>
      <AudioSourcePicker
        activeKind={sourceKind}
        fileName={audio.source?.kind === 'file' ? audio.source.fileName : null}
        hasSource={Boolean(audio.source)}
        error={audio.error}
        desktopSupported={desktopSupported}
        demoLoading={demoLoading}
        onSelectKind={handleSelectKind}
        onDesktopSelect={handleDesktopSelect}
        onShowDesktopGuide={() => setDesktopGuideOpen(true)}
        onYouTubeSelect={handleYouTubeSelect}
        onYouTubeLoad={handleYouTubeLoad}
        youtubeVideoId={youtubeVideoId}
        onFile={handleFile}
        onTryDemo={() => void handleTryDemo()}
        onClearSource={handleClearSource}
      />
      {audio.source?.kind === 'file' ? (
        <AudioControls
          isPlaying={audio.isPlaying}
          currentTime={audio.currentTime}
          duration={audio.duration}
          volume={audio.volume}
          muted={audio.muted}
          onTogglePlay={audio.togglePlay}
          onSeek={audio.seek}
          onVolumeChange={(v) => {
            if (audio.muted) audio.setMuted(false);
            audio.setVolume(v);
          }}
          onToggleMute={audio.toggleMute}
        />
      ) : null}
      <PresetPicker active={preset} onChange={handlePresetChange} onRandom={handleRandomPreset} />
      <ControlPanel
        controls={controls}
        onChange={(patch) => setControls((c) => ({ ...c, ...patch }))}
        palette={palette}
        onPaletteChange={setPalette}
        showBpm={showBpm}
        onShowBpmChange={setShowBpm}
        unlocked={unlock.unlocked}
        onLoadSaved={handleLoadSaved}
        onSavePreset={handleSavePreset}
        presetsVersion={presetsVersion}
        onPresetsChange={() => setPresetsVersion((v) => v + 1)}
        analyser={audio.analyser}
        activePreset={preset}
        onPickPaletteImage={handlePickPaletteImage}
        background={background}
        onBackgroundChange={(patch) => setBackground((b) => ({ ...b, ...patch }))}
      />
      <TitleOverlayPanel
        overlay={titleOverlay}
        onChange={(patch) => setTitleOverlay((o) => ({ ...o, ...patch }))}
        unlocked={unlock.unlocked}
      />
      <ExportPanel
        unlocked={unlock.unlocked}
        resolution={resolution}
        aspect={aspect}
        fps={fps}
        onResolutionChange={setResolution}
        onAspectChange={setAspect}
        onFpsChange={setFps}
        recording={isRecording}
        rendering={exportHook.state === 'rendering'}
        elapsedSec={exportHook.elapsedSec}
        hasSource={Boolean(audio.source)}
        hasFileSource={audio.source?.kind === 'file'}
        onStart={() => void startExport()}
        onStop={exportHook.stop}
        onSnapshot={() => void handleSnapshot()}
        onPrerender={() => void handlePrerender()}
        onCancelPrerender={prerender.cancel}
        prerenderSupported={prerender.supported}
        prerenderActive={prerender.rootMount !== null}
        prerenderProgressPercent={prerender.progress.percent}
        prerenderProgressMessage={prerender.progress.message ?? ''}
        prerenderError={prerender.error}
        watermarkShow={watermark.show}
        watermarkImageDataUrl={watermark.customImageDataUrl}
        onWatermarkShowChange={(show) => setWatermark((w) => ({ ...w, show }))}
        onWatermarkImageFile={(file) => void handleWatermarkImageFile(file)}
        onWatermarkImageReset={() => setWatermark((w) => ({ ...w, customImageDataUrl: null }))}
      />
      {!unlock.unlocked ? (
        <p className="text-center text-xs text-torus-fg-faint">
          <Link href="/license" className="text-torus-mid hover:underline">
            Get the Production License ($10, one-time)
          </Link>
        </p>
      ) : null}
    </>
  );

  const viewportCanvas = (
    <>
      {audio.source ? (
        <>
          <div className="flex h-full w-full items-center justify-center">
            <div
              className={`relative ${previewPortrait ? 'h-full max-w-full' : 'w-full max-h-full'}`}
              style={{ aspectRatio: previewAspect }}
            >
              <VisualizerCanvas
                audioRef={audio.source.kind === 'file' ? audio.audioRef : undefined}
                analyserOverride={audio.source.kind !== 'file' ? audio.analyser : undefined}
                preset={preset}
                palette={palette}
                embedded={false}
                exportSize={isRecording ? exportSize : undefined}
                pixelRatio={isRecording ? 1 : undefined}
                onGlCanvasReady={(c) => {
                  glCanvasRef.current = c;
                }}
                reactivity={controls.reactivity}
                bassMix={controls.bassMix}
                midMix={controls.midMix}
                highMix={controls.highMix}
                speed={controls.speed}
                smoothness={controls.smoothness ?? 0}
                scale={controls.scale ?? 1}
                bassShake={controls.bassShake ?? 0}
                bassMaxHz={controls.bassMaxHz ?? 250}
                midMaxHz={controls.midMaxHz ?? 2000}
                anima={controls.anima ?? 0.5}
                aura={controls.aura ?? 0.4}
                cinematicSpeed={controls.cinematicSpeed ?? 1}
                cameraDistance={controls.cameraDistance ?? 1}
                lightLevel={controls.lightLevel ?? 1}
                energy={controls.energy ?? 0}
                autoGain={controls.autoGain ?? true}
                colorLife={controls.colorLife ?? 0.6}
                background={background.mode}
                backgroundIntensity={background.intensity}
                inflate={controls.inflate ?? 0.5}
                appendages={controls.appendages ?? 4}
                subSpheres={controls.subSpheres ?? 6}
                turbulence={controls.turbulence ?? 1}
                trailLength={controls.trailLength ?? 1}
                density={controls.density ?? 1}
                vortexAmount={controls.vortexAmount ?? 0.25}
                interactStrength={controls.interactStrength ?? 1}
                bloomIntensity={controls.bloomIntensity}
                cameraMode={controls.cameraMode}
                creature={creature?.personality}
                bpmRef={bpmRef}
                lastOnsetRef={lastOnsetRef}
              />
            </div>
          </div>
          {audio.source.kind === 'file' ? (
            <div
              className={`absolute bottom-3 left-1/2 z-30 -translate-x-1/2 flex items-center gap-2 rounded-full border border-torus-border bg-torus-bg/80 px-3 py-1.5 text-xs backdrop-blur-sm ${overlayFade} ${overlayHidden}`}
            >
              <button
                type="button"
                onClick={audio.togglePlay}
                aria-label={audio.isPlaying ? 'Pause' : 'Play'}
                className="text-torus-mid"
              >
                {audio.isPlaying ? 'Pause' : 'Play'}
              </button>
              <span className="text-torus-fg-faint truncate max-w-[200px]">
                {audio.source.fileName}
              </span>
            </div>
          ) : null}
          {isRecording ? (
            <div
              className={`absolute top-3 right-3 z-30 rounded-full bg-torus-bass/20 px-3 py-1 text-xs text-torus-bass border border-torus-bass/40 ${overlayFade} ${overlayHidden}`}
            >
              REC {formatTime(exportHook.elapsedSec)}
            </div>
          ) : null}
          <BPMIndicator
            bpm={bpm}
            confident={confident}
            visible={showBpm}
            fileSource={audio.source.kind === 'file'}
            className={`${overlayFade} ${overlayHidden}`}
          />
        </>
      ) : (
        <EmptyStateHero
          reducedMotion={reducedMotion}
          onTryDemo={() => void handleTryDemo()}
          demoLoading={demoLoading}
        />
      )}
    </>
  );

  if (!heroCollapsed) {
    return (
      <div className={`min-h-dvh ${!unlock.unlocked ? 'pb-12' : ''}`}>
        <HwAccelBanner />
        <header className="border-b border-torus-border px-4 pb-8 pt-16 md:px-8">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <Logo size={48} wordmark href={null} color="var(--color-torus-mid)" />
              <h1 className="mt-4 text-2xl font-semibold tracking-tight">torus visualizer</h1>
              <p className="mt-2 max-w-xl text-sm text-torus-fg-dim">
                Turn any audio into beautiful 3D visuals. Drop a track, use your mic, or capture
                desktop audio — then export for Reels, Shorts, and portfolios.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
                <span className="rounded-full border border-torus-border px-3 py-1">Free: 720p / 30 FPS</span>
                <span className="rounded-full border border-torus-mid/30 px-3 py-1 text-torus-mid">
                  Full: $10 one-time — up to 4K / 240 FPS, no watermark
                </span>
                <Link href="/about" className="text-torus-fg-faint hover:text-torus-mid">
                  More about torus →
                </Link>
              </div>
            </div>
            <button
              type="button"
              onClick={collapseHero}
              className="self-start rounded-full border border-torus-border px-4 py-2 text-sm text-torus-fg-dim hover:border-torus-mid/40"
            >
              Open the app →
            </button>
          </div>
        </header>

        <main className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-4">{sidebarPanels}</aside>
          <section className="relative flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-torus-border bg-torus-bg lg:min-h-[560px]">
            <div className="relative min-h-0 flex-1">{viewportCanvas}</div>
          </section>
        </main>

        {!unlock.unlocked && !unlock.checking ? <UnlockBanner /> : null}
        <ShortcutsModal
          open={shortcutsOpen}
          onClose={() => setShortcutsOpen(false)}
          hasFileSource={audio.source?.kind === 'file'}
        />
        <DesktopAudioGuide
          open={desktopGuideOpen}
          reducedMotion={reducedMotion}
          onClose={() => setDesktopGuideOpen(false)}
          onPick={handleDesktopPick}
        />
        {youtubeVideoId ? (
          <YouTubePanel
            videoId={youtubeVideoId}
            capturing={audio.source?.kind === 'youtube'}
            error={sourceKind === 'youtube' ? audio.error : null}
            onCapture={handleYouTubeCapture}
            onStopCapture={handleYouTubeStopCapture}
            onClose={handleYouTubeClose}
          />
        ) : null}
        {prerender.rootMount ? <PrerenderRoot {...prerender.rootMount} /> : null}
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <HwAccelBanner />
      <header className="flex items-center justify-end gap-3 border-b border-torus-border py-3 px-4">
        <FeedbackButton />
        <button
          type="button"
          onClick={() => setShortcutsOpen(true)}
          className="text-xs text-torus-fg-faint hover:text-torus-mid"
          title="Keyboard shortcuts (?)"
        >
          Shortcuts
        </button>
        <button
          type="button"
          onClick={() => setHeroCollapsed(false)}
          className="text-xs text-torus-fg-faint hover:text-torus-mid"
        >
          Intro
        </button>
        <Link href="/about" className="text-xs text-torus-fg-faint hover:text-torus-mid">
          About
        </Link>
      </header>

      <main
        ref={viewportRef}
        className="relative flex-1 overflow-hidden bg-torus-bg"
        onPointerMove={revealAll}
        onPointerDown={revealAll}
        onClick={revealAll}
        onWheel={revealAll}
        onKeyDown={revealAll}
      >
        <section className="absolute inset-0 flex flex-col">
          <div className="relative min-h-0 flex-1">{viewportCanvas}</div>
          {audio.source?.kind === 'file' ? (
            <div
              className={`absolute left-0 right-0 z-20 ${isMobile ? 'bottom-9' : 'bottom-0'} ${overlayFade} ${overlayHidden}`}
            >
              <Scrubber
                currentTime={audio.currentTime}
                duration={audio.duration}
                onSeek={audio.seek}
              />
            </div>
          ) : null}
        </section>

        {!isMobile ? (
          <aside
            aria-label="Visualizer controls"
            onPointerEnter={revealSidebar}
            onPointerMove={revealSidebar}
            className={`absolute left-4 top-4 bottom-4 z-20 flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-4 overflow-y-auto rounded-xl border border-torus-border bg-torus-surface/70 p-4 shadow-2xl backdrop-blur-md ${sidebarFade} ${sidebarHidden}`}
          >
            {sidebarPanels}
          </aside>
        ) : (
          /* Mobile: collapsible bottom sheet so the visuals stay visible. */
          <aside
            aria-label="Visualizer controls"
            className="absolute inset-x-0 bottom-0 z-30 flex flex-col border-t border-torus-border bg-torus-surface/90 backdrop-blur-md"
          >
            <button
              type="button"
              onClick={() => setMobileControlsOpen((o) => !o)}
              aria-expanded={mobileControlsOpen}
              className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-medium text-torus-fg-dim"
            >
              <span>Controls</span>
              <span aria-hidden>{mobileControlsOpen ? '\u25be' : '\u25b4'}</span>
            </button>
            {mobileControlsOpen ? (
              <div className="flex max-h-[50dvh] flex-col gap-4 overflow-y-auto border-t border-torus-border p-4">
                {sidebarPanels}
              </div>
            ) : null}
          </aside>
        )}
      </main>

      {/* Reserve room so the fixed banner never covers the scrubber/controls. */}
      {bannerVisible ? <div className="h-12 shrink-0" aria-hidden /> : null}
      {bannerVisible ? <UnlockBanner /> : null}
      <ShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        hasFileSource={audio.source?.kind === 'file'}
      />
      <DesktopAudioGuide
        open={desktopGuideOpen}
        reducedMotion={reducedMotion}
        onClose={() => setDesktopGuideOpen(false)}
        onPick={handleDesktopPick}
      />
      {youtubeVideoId ? (
        <YouTubePanel
          videoId={youtubeVideoId}
          capturing={audio.source?.kind === 'youtube'}
          error={sourceKind === 'youtube' ? audio.error : null}
          onCapture={handleYouTubeCapture}
          onStopCapture={handleYouTubeStopCapture}
          onClose={handleYouTubeClose}
        />
      ) : null}
      {prerender.rootMount ? <PrerenderRoot {...prerender.rootMount} /> : null}
    </div>
  );
}
