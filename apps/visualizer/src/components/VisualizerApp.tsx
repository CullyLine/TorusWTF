'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Logo } from '@torus/ui';
import {
  pickRandomVisualizerPreset,
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
import { useDemoTracks } from '@/components/DemoTracks';
import { EmptyStateHero } from '@/components/EmptyStateHero';
import { PresetPicker } from '@/components/PresetPicker';
import { Scrubber } from '@/components/Scrubber';
import { ShortcutsModal } from '@/components/ShortcutsModal';
import { BPMIndicator } from '@/components/BPMIndicator';
import { ControlPanel } from '@/components/ControlPanel';
import { ExportPanel } from '@/components/ExportPanel';
import { UnlockBanner } from '@/components/UnlockBanner';
import { useAudioSource, type SourceKind } from '@/hooks/useAudioSource';
import { useExport } from '@/hooks/useExport';
import { useBPM } from '@/hooks/useBPM';
import { useIdleHide } from '@/hooks/useIdleHide';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useToast } from '@/hooks/useToast';
import { useUnlock } from '@/hooks/useUnlock';
import { DEFAULT_PALETTE, isChromium } from '@/lib/palettes';
import { downloadSnapshot, takeSnapshot } from '@/lib/snapshot';
import {
  FREE_MAX_FPS,
  FREE_MAX_RES,
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
  DESKTOP_GUIDE_SEEN_KEY,
  loadSavedPresets,
  persistSavedPresets,
  type SavedPreset,
  type VisualizerControls,
} from '@/lib/storage';

const VisualizerCanvas = dynamic(
  () => import('@torus/visualizers').then((m) => m.VisualizerCanvas),
  { ssr: false },
);

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VisualizerApp() {
  const audio = useAudioSource();
  const unlock = useUnlock();
  const exportHook = useExport(unlock.unlocked);
  const { toast, prompt } = useToast();
  const demoTracks = useDemoTracks();

  const [preset, setPreset] = usePersistedState<VisualizerId>(PRESET_KEY, 'torus_field');
  const [palette, setPalette] = usePersistedState<WaveformPalette>(PALETTE_KEY, DEFAULT_PALETTE);
  const [controls, setControls] = usePersistedState<VisualizerControls>(
    CONTROLS_KEY,
    DEFAULT_CONTROLS,
  );
  const [resolution, setResolution] = usePersistedState<ExportResolution>(
    EXPORT_RESOLUTION_KEY,
    FREE_MAX_RES,
  );
  const [fps, setFps] = usePersistedState<ExportFps>(EXPORT_FPS_KEY, FREE_MAX_FPS);
  const [aspect, setAspect] = usePersistedState<AspectRatio>(EXPORT_ASPECT_KEY, '16:9');
  const [sourceKind, setSourceKind] = usePersistedState<SourceKind | null>(
    SOURCE_KIND_KEY,
    null,
  );
  const [heroCollapsed, setHeroCollapsed] = useState(true);
  const [presetsVersion, setPresetsVersion] = useState(0);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [showBpm, setShowBpm] = usePersistedState<boolean>(SHOW_BPM_KEY, false);
  const [desktopGuideSeen, setDesktopGuideSeen] = usePersistedState<boolean>(
    DESKTOP_GUIDE_SEEN_KEY,
    false,
  );
  const [desktopGuideOpen, setDesktopGuideOpen] = useState(false);
  const [desktopSupported, setDesktopSupported] = useState(false);
  const [wtfTrackTitle, setWtfTrackTitle] = useState<string | null>(null);
  const [creature, setCreature] = useState<Creature | null>(null);

  useEffect(() => {
    setDesktopSupported(isChromium());
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

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

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
      setWtfTrackTitle(null);
      setSourceKind(kind);
      if (kind === 'mic') await audio.startMic();
      if (kind === 'tab') await audio.startTab();
    },
    [audio, setSourceKind],
  );

  const handleDesktopSelect = useCallback(() => {
    if (!desktopGuideSeen) {
      setDesktopGuideOpen(true);
      return;
    }
    void handleSelectKind('tab');
  }, [desktopGuideSeen, handleSelectKind]);

  const handleDesktopGuideConfirm = useCallback(
    (dontShowAgain: boolean) => {
      if (dontShowAgain) setDesktopGuideSeen(true);
      setDesktopGuideOpen(false);
      void handleSelectKind('tab');
    },
    [handleSelectKind, setDesktopGuideSeen],
  );

  const handleFile = useCallback(
    (file: File) => {
      setWtfTrackTitle(null);
      setSourceKind('file');
      audio.loadFile(file);
      setHeroCollapsed(true);
    },
    [audio, setSourceKind],
  );

  const handleTryDemo = useCallback(async () => {
    try {
      const res = await fetch('/demo.mp3');
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      handleFile(new File([blob], 'demo.mp3', { type: 'audio/mpeg' }));
    } catch {
      toast({ message: 'Could not load demo audio', variant: 'error' });
    }
  }, [handleFile, toast]);

  const handlePlayDemoTrack = useCallback(() => {
    const track = demoTracks.pickRandom();
    if (!track) return;
    setSourceKind('file');
    setHeroCollapsed(true);
    setWtfTrackTitle(track.title);
    audio.playUrl(track.file, { title: track.title, sourceLink: track.permalink });
  }, [audio, demoTracks, setSourceKind]);

  const handleRandomPreset = useCallback(() => {
    setPreset(pickRandomVisualizerPreset());
  }, []);

  const handleLoadSaved = useCallback((saved: SavedPreset) => {
    setPreset(saved.presetId);
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
      bloomIntensity: saved.bloomIntensity,
      cameraMode: saved.cameraMode,
    });
  }, []);

  const handleSavePreset = useCallback(async () => {
    if (!unlock.unlocked) return;
    const name = await prompt({ message: 'Preset name', placeholder: 'My preset' });
    if (!name?.trim()) return;
    const saved = loadSavedPresets();
    const entry: SavedPreset = {
      id: crypto.randomUUID(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
      presetId: preset,
      palette,
      ...controls,
    };
    try {
      persistSavedPresets([entry, ...saved]);
      setPresetsVersion((v) => v + 1);
      toast({ message: `Saved "${name.trim()}"`, variant: 'success' });
    } catch {
      toast({ message: 'Could not save preset', variant: 'error' });
    }
  }, [unlock.unlocked, preset, palette, controls, prompt, toast]);

  const startExport = useCallback(async () => {
    const canvas = glCanvasRef.current;
    if (!canvas || !audio.source) return;

    await exportHook.start({
      glCanvas: canvas,
      audioStream: audio.getAudioStreamForExport(),
      resolution,
      aspect,
      fps,
      onBeforeRecord: async () => {
        if (audio.source?.kind === 'file') {
          await audio.restartFile();
        }
      },
      onFileEnded: () => exportHook.stop(),
    });
  }, [audio, exportHook, resolution, aspect, fps]);

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

  const exportSize = dimensionsFor(resolution, aspect);
  const isRecording = exportHook.state === 'recording';
  const previewAspect = `${exportSize.width} / ${exportSize.height}`;
  const previewPortrait = aspect === '9:16' || aspect === '4:5';
  const { uiVisible: overlayVisible, reveal: revealOverlay, hide: hideOverlay } = useIdleHide({
    forceVisible: isRecording,
  });
  const { uiVisible: sidebarVisible, reveal: revealSidebar, hide: hideSidebar } = useIdleHide({
    forceVisible: isRecording,
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
        demoTracksAvailable={demoTracks.available}
        wtfActiveTitle={wtfTrackTitle}
        onSelectKind={handleSelectKind}
        onDesktopSelect={handleDesktopSelect}
        onShowDesktopGuide={() => setDesktopGuideOpen(true)}
        onFile={handleFile}
        onTryDemo={() => void handleTryDemo()}
        onPlayDemoTrack={handlePlayDemoTrack}
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
      <PresetPicker active={preset} onChange={setPreset} onRandom={handleRandomPreset} />
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
        onStart={() => void startExport()}
        onStop={exportHook.stop}
        onSnapshot={() => void handleSnapshot()}
      />
      {!unlock.unlocked ? (
        <p className="text-center text-xs text-torus-fg-faint">
          <Link href="/unlock" className="text-torus-mid hover:underline">
            Unlock full version ($10)
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
              <button type="button" onClick={audio.togglePlay} className="text-torus-mid">
                {audio.isPlaying ? 'pause' : 'play'}
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
        />
      )}
    </>
  );

  if (!heroCollapsed) {
    return (
      <div className={`min-h-dvh ${!unlock.unlocked ? 'pb-12' : ''}`}>
        <HwAccelBanner />
        <header className="border-b border-torus-border px-4 py-8 md:px-8">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <Logo size={48} wordmark href={null} color="var(--color-torus-mid)" />
              <h1 className="mt-4 text-2xl font-semibold tracking-tight">torus visualizer</h1>
              <p className="mt-2 max-w-xl text-sm text-torus-fg-dim">
                Turn any audio into beautiful 3D visuals. Drop a track, use your mic, capture
                desktop audio, or hit WTF for a random demo — then export for Reels, Shorts, and
                portfolios.
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-xs">
                <span className="rounded-full border border-torus-border px-3 py-1">Free: 720p / 30 FPS</span>
                <span className="rounded-full border border-torus-mid/30 px-3 py-1 text-torus-mid">
                  Full: $10 one-time — 4K / 240 FPS, no watermark
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setHeroCollapsed(true)}
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
          onConfirm={handleDesktopGuideConfirm}
        />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <HwAccelBanner />
      <header className="flex items-center justify-between border-b border-torus-border px-4 py-3">
        <Logo size={32} wordmark href={null} color="var(--color-torus-mid)" />
        <div className="flex items-center gap-2">
          <FeedbackButton />
          <button
            type="button"
            onClick={() => setHeroCollapsed(false)}
            className="text-xs text-torus-fg-faint hover:text-torus-mid"
          >
            About
          </button>
        </div>
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
            <div className={`absolute bottom-0 left-0 right-0 z-30 ${overlayFade} ${overlayHidden}`}>
              <Scrubber
                currentTime={audio.currentTime}
                duration={audio.duration}
                onSeek={audio.seek}
              />
            </div>
          ) : null}
        </section>

        <aside
          aria-label="Visualizer controls"
          onPointerEnter={revealSidebar}
          onPointerMove={revealSidebar}
          className={`absolute left-4 top-4 bottom-4 z-20 hidden w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-4 overflow-y-auto rounded-xl border border-torus-border bg-torus-surface/70 p-4 shadow-2xl backdrop-blur-md md:flex ${sidebarFade} ${sidebarHidden}`}
        >
          {sidebarPanels}
        </aside>

        {/* Mobile fallback: inline sidebar drawer at the bottom */}
        <aside
          aria-label="Visualizer controls (mobile)"
          className="absolute inset-x-0 bottom-0 z-20 flex max-h-[55dvh] flex-col gap-4 overflow-y-auto border-t border-torus-border bg-torus-surface/90 p-4 backdrop-blur-md md:hidden"
        >
          {sidebarPanels}
        </aside>
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
        onConfirm={handleDesktopGuideConfirm}
      />
    </div>
  );
}
