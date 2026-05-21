'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Logo } from '@torus/ui';
import {
  pickRandomVisualizerPreset,
  type VisualizerId,
} from '@torus/visualizers';
import type { WaveformPalette } from '@torus/shared';
import { AudioSourcePicker } from '@/components/AudioSourcePicker';
import { PresetPicker } from '@/components/PresetPicker';
import { ControlPanel } from '@/components/ControlPanel';
import { ExportPanel } from '@/components/ExportPanel';
import { UnlockBanner } from '@/components/UnlockBanner';
import { useAudioSource, type SourceKind } from '@/hooks/useAudioSource';
import { useExport } from '@/hooks/useExport';
import { useUnlock } from '@/hooks/useUnlock';
import { DEFAULT_PALETTE, isChromium } from '@/lib/palettes';
import {
  FREE_MAX_FPS,
  FREE_MAX_RES,
  RESOLUTION_SIZES,
  type ExportFps,
  type ExportResolution,
} from '@/lib/export-config';
import {
  DEFAULT_CONTROLS,
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

  const [preset, setPreset] = useState<VisualizerId>('torus_field');
  const [palette, setPalette] = useState<WaveformPalette>(DEFAULT_PALETTE);
  const [controls, setControls] = useState<VisualizerControls>(DEFAULT_CONTROLS);
  const [resolution, setResolution] = useState<ExportResolution>(FREE_MAX_RES);
  const [fps, setFps] = useState<ExportFps>(FREE_MAX_FPS);
  const [sourceKind, setSourceKind] = useState<SourceKind | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [heroCollapsed, setHeroCollapsed] = useState(false);
  const [presetsVersion, setPresetsVersion] = useState(0);

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
  }, [reducedMotion]);

  const handleSelectKind = useCallback(
    async (kind: SourceKind) => {
      setSourceKind(kind);
      if (kind === 'mic') await audio.startMic();
      if (kind === 'tab') await audio.startTab();
    },
    [audio],
  );

  const handleFile = useCallback(
    (file: File) => {
      setSourceKind('file');
      audio.loadFile(file);
      setHeroCollapsed(true);
    },
    [audio],
  );

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
      bloomIntensity: saved.bloomIntensity,
      cameraMode: saved.cameraMode,
    });
  }, []);

  const handleSavePreset = useCallback(() => {
    if (!unlock.unlocked) return;
    const name = window.prompt('Preset name');
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
    persistSavedPresets([entry, ...saved]);
    setPresetsVersion((v) => v + 1);
  }, [unlock.unlocked, preset, palette, controls]);

  const startExport = useCallback(async () => {
    const canvas = glCanvasRef.current;
    if (!canvas || !audio.source) return;

    await exportHook.start({
      glCanvas: canvas,
      audioStream: audio.getAudioStreamForExport(),
      resolution,
      fps,
      onBeforeRecord: async () => {
        if (audio.source?.kind === 'file') {
          await audio.restartFile();
        }
      },
      onFileEnded: () => exportHook.stop(),
    });
  }, [audio, exportHook, resolution, fps]);

  const exportSize = RESOLUTION_SIZES[resolution];
  const isRecording = exportHook.state === 'recording';

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
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [audio, handleRandomPreset]);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    if (!isRecording || audio.source?.kind !== 'file') return;
    const el = audio.audioRef.current;
    if (!el) return;
    const onEnded = () => exportHook.stop();
    el.addEventListener('ended', onEnded);
    return () => el.removeEventListener('ended', onEnded);
  }, [isRecording, audio.source, audio.audioRef, exportHook]);

  return (
    <div className={`min-h-dvh ${!unlock.unlocked ? 'pb-12' : ''}`}>
      {!heroCollapsed ? (
        <header className="border-b border-torus-border px-4 py-8 md:px-8">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <Logo size={48} wordmark href={null} color="var(--color-torus-mid)" />
              <h1 className="mt-4 text-2xl font-semibold tracking-tight">torus visualizer</h1>
              <p className="mt-2 max-w-xl text-sm text-torus-fg-dim">
                Turn any audio into beautiful 3D visuals. Drop a track, use your mic, or capture a
                browser tab — then export for Reels, Shorts, and portfolios.
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
      ) : (
        <header className="flex items-center justify-between border-b border-torus-border px-4 py-3">
          <Logo size={32} wordmark href={null} color="var(--color-torus-mid)" />
          <button
            type="button"
            onClick={() => setHeroCollapsed(false)}
            className="text-xs text-torus-fg-faint hover:text-torus-mid"
          >
            About
          </button>
        </header>
      )}

      <main className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <AudioSourcePicker
            activeKind={sourceKind}
            fileName={audio.source?.kind === 'file' ? audio.source.fileName : null}
            error={audio.error}
            tabSupported={isChromium()}
            onSelectKind={handleSelectKind}
            onFile={handleFile}
          />
          <PresetPicker active={preset} onChange={setPreset} onRandom={handleRandomPreset} />
          <ControlPanel
            controls={controls}
            onChange={(patch) => setControls((c) => ({ ...c, ...patch }))}
            palette={palette}
            onPaletteChange={setPalette}
            unlocked={unlock.unlocked}
            onLoadSaved={handleLoadSaved}
            onSavePreset={handleSavePreset}
            presetsVersion={presetsVersion}
            onPresetsChange={() => setPresetsVersion((v) => v + 1)}
          />
          <ExportPanel
            unlocked={unlock.unlocked}
            resolution={resolution}
            fps={fps}
            onResolutionChange={setResolution}
            onFpsChange={setFps}
            recording={isRecording}
            rendering={exportHook.state === 'rendering'}
            elapsedSec={exportHook.elapsedSec}
            hasSource={Boolean(audio.source)}
            onStart={() => void startExport()}
            onStop={exportHook.stop}
          />
          {!unlock.unlocked ? (
            <p className="text-center text-xs text-torus-fg-faint">
              <Link href="/unlock" className="text-torus-mid hover:underline">
                Unlock full version ($10)
              </Link>
            </p>
          ) : null}
        </aside>

        <section
          ref={viewportRef}
          className={`relative overflow-hidden rounded-xl border border-torus-border bg-torus-bg ${
            fullscreen ? 'h-dvh' : 'min-h-[420px] lg:min-h-[560px]'
          }`}
        >
          {audio.source ? (
            <>
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
                bloomIntensity={controls.bloomIntensity}
                cameraMode={controls.cameraMode}
              />
              {audio.source.kind === 'file' ? (
                <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full border border-torus-border bg-torus-bg/80 px-3 py-1.5 text-xs backdrop-blur-sm">
                  <button type="button" onClick={audio.togglePlay} className="text-torus-mid">
                    {audio.isPlaying ? 'pause' : 'play'}
                  </button>
                  <span className="text-torus-fg-faint truncate max-w-[200px]">
                    {audio.source.fileName}
                  </span>
                </div>
              ) : null}
              {isRecording ? (
                <div className="absolute top-3 right-3 rounded-full bg-torus-bass/20 px-3 py-1 text-xs text-torus-bass border border-torus-bass/40">
                  REC {formatTime(exportHook.elapsedSec)}
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex h-full min-h-[420px] flex-col items-center justify-center px-6 text-center">
              <p className="text-sm text-torus-fg-dim">
                Drop a track, talk into your mic, or share a tab to see the visualizer.
              </p>
              <p className="mt-2 text-xs text-torus-fg-faint">
                Shortcuts: Space play/pause · F fullscreen · R random preset
              </p>
            </div>
          )}
        </section>
      </main>

      {!unlock.unlocked && !unlock.checking ? <UnlockBanner /> : null}
    </div>
  );
}
