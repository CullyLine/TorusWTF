'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createImpulses, type AudioMetrics, type Creature } from '@torus/visualizers';
import { AUDIO_ACCEPT, AudioSourcePicker } from '@/components/panels/AudioSourcePicker';
import { BandsPanel } from '@/components/panels/BandsPanel';
import { EffectsPanel } from '@/components/panels/EffectsPanel';
import { ExportPanel } from '@/components/panels/ExportPanel';
import { LookControls } from '@/components/panels/LookControls';
import { ModulationPanel } from '@/components/panels/ModulationPanel';
import { PalettePanel } from '@/components/panels/PalettePanel';
import { PresetPicker } from '@/components/panels/PresetPicker';
import { SavedLooks } from '@/components/panels/SavedLooks';
import { ShowPanel } from '@/components/panels/ShowPanel';
import { TitleOverlayPanel } from '@/components/panels/TitleOverlayPanel';
import { TriggerPanel } from '@/components/panels/TriggerPanel';
import { BPMIndicator } from '@/components/studio/BPMIndicator';
import { DesktopAudioGuide } from '@/components/studio/DesktopAudioGuide';
import { EmptyState } from '@/components/studio/EmptyState';
import { HwAccelBanner } from '@/components/studio/HwAccelBanner';
import { PrerenderRoot } from '@/components/studio/PrerenderRoot';
import { ShortcutsModal } from '@/components/studio/ShortcutsModal';
import { StudioTabBar, StudioTabPanel, type StudioTabId } from '@/components/studio/SidebarTabs';
import { StageCanvas } from '@/components/studio/StageCanvas';
import { TransportBar } from '@/components/studio/TransportBar';
import { YouTubePanel } from '@/components/studio/YouTubePanel';
import { TopBar } from '@/components/TopBar';
import { cx } from '@/components/ui/controls';
import { FullscreenIcon, SidebarIcon } from '@/components/ui/icons';
import { useAudioSource } from '@/hooks/useAudioSource';
import { useBPM } from '@/hooks/useBPM';
import { useExportSettings } from '@/hooks/useExportSettings';
import { useIdleHide } from '@/hooks/useIdleHide';
import { useLook } from '@/hooks/useLook';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useProjectorBridge } from '@/hooks/useProjectorBridge';
import { useStudioExport } from '@/hooks/useStudioExport';
import { useStudioSource } from '@/hooks/useStudioSource';
import { useToast } from '@/hooks/useToast';
import { useTriggerEngine } from '@/hooks/useTriggerEngine';
import { loadCreature, rerollCreature } from '@/lib/creatureStorage';
import { extractPaletteFromBlob } from '@/lib/extractPalette';
import { isEditableTarget, isKeyboardFocusedControl } from '@/lib/keyboard';
import { useWebMidi } from '@/lib/midi';
import type { ProjectorStatePayload } from '@/lib/projectorSync';
import { CONTROLS_OPEN_KEY, SHOW_BPM_KEY } from '@/lib/storage';
import { formatClock } from '@/lib/time';

/**
 * The visualizer page. It lays out the top bar, the sidebar of controls, and
 * the stage, and connects the panels to the hooks that hold the state:
 *
 * - `useAudioSource` and `useStudioSource` hold the audio and how it was chosen.
 * - `useLook` holds what the visuals look like and how they react.
 * - `useExportSettings` and `useStudioExport` hold the export format and run exports.
 */
export function VisualizerApp() {
  const audio = useAudioSource();
  const { toast } = useToast();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const isMobile = useMediaQuery('(max-width: 767px)');

  const look = useLook({ reducedMotion });
  const source = useStudioSource({ audio, look });
  const exportSettings = useExportSettings();

  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Each browser gets a random "creature": a personality that biases how the
  // visuals respond. `window.__torus.rerollCreature()` rolls a new one from
  // the console, which is useful when tuning.
  const [creature, setCreature] = useState<Creature | null>(null);
  useEffect(() => {
    const loaded = loadCreature();
    setCreature(loaded);
    const host = window as unknown as {
      __torus?: { creature: Creature; rerollCreature: () => Creature };
    };
    host.__torus = {
      creature: loaded,
      rerollCreature: () => {
        const fresh = rerollCreature();
        setCreature(fresh);
        if (host.__torus) host.__torus.creature = fresh;
        return fresh;
      },
    };
  }, []);

  const exporter = useStudioExport({
    audio,
    look,
    settings: exportSettings,
    canvasRef: glCanvasRef,
    creature: creature?.personality,
  });

  // ---------- Triggers, MIDI, projector ----------

  // The canvas writes its newest metrics into this ref every frame. The
  // trigger engine, the projector bridge, and the modulation meters read it.
  const metricsOutRef = useRef<AudioMetrics | null>(null);
  // One-shot visual commands such as a camera punch. The object is stable and
  // the canvas consumes it field by field in its frame loop.
  const impulses = useMemo(() => createImpulses(), []);

  const projectorState = useMemo<ProjectorStatePayload>(
    () => ({
      preset: look.preset,
      palette: look.palette,
      controls: look.controls,
      background: look.background,
      screenEffect: look.screenEffect,
      emitter: look.emitter,
      modMatrix: look.modMatrix,
    }),
    [
      look.preset,
      look.palette,
      look.controls,
      look.background,
      look.screenEffect,
      look.emitter,
      look.modMatrix,
    ],
  );
  const projector = useProjectorBridge({ state: projectorState, metricsRef: metricsOutRef });

  const triggerEngine = useTriggerEngine({
    enabled: Boolean(audio.source),
    mappings: look.triggerMappings,
    metricsRef: metricsOutRef,
    impulses,
    actions: {
      nextPreset: () => look.stepVisualizer(1),
      prevPreset: () => look.stepVisualizer(-1),
      randomPreset: look.randomVisualizer,
      randomPalette: look.randomPalette,
      randomShader: look.randomScreenEffect,
    },
    onImpulse: projector.postImpulse,
  });
  const midi = useWebMidi(triggerEngine.handleMidiNote);

  // Tempo detection runs whenever there is audio, shown or not, because the
  // visualizers read beat and bar phase from it.
  const [showBpm, setShowBpm] = usePersistedState<boolean>(SHOW_BPM_KEY, false);
  const { bpm, confident, bpmRef, lastOnsetRef } = useBPM(audio.analyser, Boolean(audio.source));

  const { setPalette } = look;
  const handlePickPaletteImage = useCallback(
    async (file: File) => {
      try {
        setPalette(await extractPaletteFromBlob(file));
        toast({ message: `Palette taken from ${file.name}`, variant: 'success' });
      } catch {
        toast({ message: 'Could not read colors from that image', variant: 'error' });
      }
    },
    [setPalette, toast],
  );

  // ---------- Page chrome ----------

  const [tab, setTab] = useState<StudioTabId>('audio');
  const [controlsOpen, setControlsOpen] = usePersistedState<boolean>(CONTROLS_OPEN_KEY, true);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const hasSource = Boolean(audio.source);
  const hasFileSource = audio.source?.kind === 'file';

  // On a phone, close the sheet when audio arrives so the visuals are visible.
  useEffect(() => {
    if (hasSource && isMobile) setSheetOpen(false);
  }, [hasSource, isMobile]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen();
  }, []);

  // In fullscreen the transport bar fades out after a moment without input.
  // Outside fullscreen it sits below the canvas and stays put.
  const { uiVisible: chromeVisible, reveal: revealChrome } = useIdleHide({
    forceVisible: !isFullscreen || exporter.isRecording,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Leave browser shortcuts such as Ctrl+R alone.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;

      if (e.code === 'Space') {
        if (!hasFileSource || isKeyboardFocusedControl(e.target)) return;
        e.preventDefault();
        audio.togglePlay();
        return;
      }

      switch (e.key) {
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case 'r':
        case 'R':
          look.randomVisualizer();
          break;
        case 'h':
        case 'H':
          setControlsOpen((open) => !open);
          break;
        case '?':
          setShortcutsOpen(true);
          break;
        case 'ArrowLeft':
        case 'ArrowRight': {
          if (!hasFileSource) break;
          e.preventDefault();
          const step = (e.shiftKey ? 15 : 5) * (e.key === 'ArrowLeft' ? -1 : 1);
          audio.seek(Math.max(0, Math.min(audio.duration, audio.currentTime + step)));
          break;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [audio, hasFileSource, look, setControlsOpen, toggleFullscreen]);

  // ---------- Panels ----------

  const { controls } = look;

  const panels: Record<StudioTabId, ReactNode> = {
    audio: (
      <>
        <AudioSourcePicker
          activeKind={source.kind}
          fileName={audio.source?.kind === 'file' ? audio.source.fileName : null}
          hasSource={hasSource}
          error={audio.error}
          desktopSupported={source.desktopSupported}
          demoLoading={source.demoLoading}
          onSelectKind={(kind) => void source.selectKind(kind)}
          onDesktopSelect={source.openDesktopGuide}
          onShowDesktopGuide={source.openDesktopGuide}
          onYouTubeSelect={source.selectYouTube}
          onYouTubeLoad={source.setYoutubeVideoId}
          youtubeVideoId={source.youtubeVideoId}
          onFile={source.loadFile}
          onTryDemo={() => void source.loadDemo()}
          onClearSource={source.clear}
        />
        <BandsPanel
          analyser={audio.analyser}
          palette={look.palette}
          controls={controls}
          onChange={look.patchControls}
          showBpm={showBpm}
          onShowBpmChange={setShowBpm}
        />
      </>
    ),
    look: (
      <>
        <PresetPicker
          active={look.preset}
          onChange={look.selectVisualizer}
          onRandom={look.randomVisualizer}
        />
        <PalettePanel
          palette={look.palette}
          onPaletteChange={look.setPalette}
          onPickPaletteImage={(file) => void handlePickPaletteImage(file)}
        />
        <LookControls
          controls={controls}
          onChange={look.patchControls}
          activePreset={look.preset}
          background={look.background}
          onBackgroundChange={look.patchBackground}
        />
        <EffectsPanel
          screenEffect={look.screenEffect}
          onScreenEffectChange={look.setScreenEffect}
          emitter={look.emitter}
          onEmitterChange={look.setEmitter}
          highlightProtection={controls.highlightProtection ?? true}
          onHighlightProtectionChange={(highlightProtection) =>
            look.patchControls({ highlightProtection })
          }
        />
        <SavedLooks
          onLoad={look.loadSavedLook}
          onSaveCurrent={() => void look.saveCurrentLook(glCanvasRef.current)}
          version={look.savedLooksVersion}
          onChange={look.refreshSavedLooks}
        />
      </>
    ),
    automate: (
      <>
        <TriggerPanel
          mappings={look.triggerMappings}
          onChange={look.setTriggerMappings}
          midi={midi}
        />
        <ModulationPanel
          routings={look.modMatrix}
          onChange={look.setModMatrix}
          activePreset={look.preset}
          metricsRef={metricsOutRef}
        />
      </>
    ),
    export: (
      <>
        <ExportPanel
          resolution={exportSettings.resolution}
          aspect={exportSettings.aspect}
          fps={exportSettings.fps}
          onResolutionChange={exportSettings.setResolution}
          onAspectChange={exportSettings.setAspect}
          onFpsChange={exportSettings.setFps}
          recording={exporter.isRecording}
          rendering={exporter.isSaving}
          elapsedSec={exporter.elapsedSec}
          hasSource={hasSource}
          hasFileSource={hasFileSource}
          onStart={() => void exporter.startRecording()}
          onStop={exporter.stopRecording}
          onSnapshot={() => void exporter.saveSnapshot()}
          onPrerender={() => void exporter.renderFullTrack()}
          onCancelPrerender={exporter.prerender.cancel}
          prerenderSupported={exporter.prerender.supported}
          prerenderActive={exporter.prerender.rootMount !== null}
          prerenderProgressPercent={exporter.prerender.progress.percent}
          prerenderProgressMessage={exporter.prerender.progress.message ?? ''}
          prerenderError={exporter.prerender.error}
          watermarkShow={exportSettings.watermark.show}
          watermarkImageDataUrl={exportSettings.watermark.customImageDataUrl}
          onWatermarkShowChange={exportSettings.setWatermarkShown}
          onWatermarkImageFile={(file) => void exportSettings.setWatermarkImageFromFile(file)}
          onWatermarkImageReset={exportSettings.resetWatermarkImage}
        />
        <TitleOverlayPanel overlay={look.titleOverlay} onChange={look.patchTitleOverlay} />
        <ShowPanel
          buildState={look.buildShowState}
          onImport={look.importShow}
          onError={(message) => toast({ message, variant: 'error' })}
          onReset={look.resetToFactory}
          projectorOpen={projector.projectorOpen}
          onOpenProjector={projector.openProjector}
        />
      </>
    ),
  };

  // ---------- Layout ----------

  const exportSize = exportSettings.size;
  const panelVisible = isMobile ? sheetOpen : controlsOpen;
  const fade = reducedMotion ? '' : 'transition-opacity duration-300';

  const handleTabSelect = (next: StudioTabId) => {
    // On a phone, tapping the open tab again closes the sheet.
    if (isMobile && sheetOpen && next === tab) {
      setSheetOpen(false);
      return;
    }
    setTab(next);
    setSheetOpen(true);
  };

  return (
    <div className="flex h-dvh flex-col" {...source.dropHandlers}>
      <HwAccelBanner />
      <TopBar app="visualizer" onOpenShortcuts={() => setShortcutsOpen(true)} />

      {/* Controls come first in the document. On a phone they sit under the stage. */}
      <div className="flex min-h-0 flex-1 flex-col-reverse md:flex-row">
        <aside
          key="controls"
          aria-label="Controls"
          className={cx(
            'flex max-h-[60dvh] shrink-0 flex-col-reverse border-t border-torus-border bg-torus-panel',
            'md:max-h-none md:w-[340px] md:flex-col md:border-r md:border-t-0',
            !controlsOpen && 'md:hidden',
          )}
        >
          <StudioTabBar
            idPrefix="studio"
            active={tab}
            onSelect={handleTabSelect}
            showSelection={panelVisible}
            className="border-t md:border-b md:border-t-0"
            trailing={
              <button
                type="button"
                onClick={() => setControlsOpen(false)}
                aria-label="Hide the controls"
                title="Hide the controls (H)"
                className="hidden w-10 place-items-center border-l border-torus-border text-torus-fg-faint hover:text-torus-fg md:grid"
              >
                <SidebarIcon />
              </button>
            }
          />
          {panelVisible ? <StudioTabPanel idPrefix="studio" active={tab} panels={panels} /> : null}
        </aside>

        <section
          key="stage"
          ref={stageRef}
          aria-label="Preview"
          className={cx(
            'relative flex min-h-0 min-w-0 flex-1 flex-col bg-torus-bg',
            isFullscreen && !chromeVisible && 'cursor-none',
          )}
          onPointerMove={revealChrome}
          onPointerDown={revealChrome}
        >
          {/* A size container, so the frame below can measure it with cqw and cqh. */}
          <div className="relative min-h-0 flex-1 [container-type:size]">
            {audio.source ? (
              <div className="flex h-full w-full items-center justify-center">
                {/* The largest box of the export's aspect ratio that fits the stage. */}
                <div
                  className="relative"
                  style={{
                    aspectRatio: `${exportSize.width} / ${exportSize.height}`,
                    width: `min(100cqw, 100cqh * ${exportSize.width} / ${exportSize.height})`,
                  }}
                >
                  <StageCanvas
                    audio={audio}
                    look={look}
                    exportSize={exporter.renderAtExportSize ? exportSize : undefined}
                    creature={creature?.personality}
                    bpmRef={bpmRef}
                    lastOnsetRef={lastOnsetRef}
                    impulses={impulses}
                    metricsOutRef={metricsOutRef}
                    onCanvasReady={(canvas) => {
                      glCanvasRef.current = canvas;
                    }}
                  />
                </div>
              </div>
            ) : (
              <EmptyState
                onTryDemo={() => void source.loadDemo()}
                onChooseFile={() => fileInputRef.current?.click()}
                demoLoading={source.demoLoading}
                reducedMotion={reducedMotion}
              />
            )}

            {!controlsOpen && !isFullscreen ? (
              <button
                type="button"
                onClick={() => setControlsOpen(true)}
                title="Show the controls (H)"
                className="absolute left-3 top-3 z-10 hidden items-center gap-2 rounded-md border border-torus-border bg-torus-panel px-2.5 py-1.5 text-xs text-torus-fg-dim hover:text-torus-fg md:flex"
              >
                <SidebarIcon />
                Controls
              </button>
            ) : null}

            <div className="pointer-events-none absolute right-3 top-3 z-10 flex flex-col items-end gap-2">
              {exporter.isRecording ? (
                <div
                  role="status"
                  className="flex items-center gap-2 rounded-md bg-torus-panel px-2.5 py-1 text-xs font-medium tabular-nums text-torus-bass"
                >
                  <span className="h-2 w-2 rounded-full bg-torus-bass" aria-hidden="true" />
                  Recording {formatClock(exporter.elapsedSec)}
                </div>
              ) : null}
              {hasSource && showBpm ? <BPMIndicator bpm={bpm} confident={confident} /> : null}
            </div>

            {source.dragActive ? (
              <div className="pointer-events-none absolute inset-3 z-20 grid place-items-center rounded-md border-2 border-dashed border-torus-mid bg-torus-bg/90 text-sm font-medium text-torus-fg">
                Drop the audio file to load it
              </div>
            ) : null}
          </div>

          {audio.source ? (
            <div
              className={cx(
                isFullscreen && 'absolute inset-x-0 bottom-0 z-20',
                isFullscreen && fade,
                isFullscreen && !chromeVisible && 'pointer-events-none opacity-0',
              )}
            >
              <TransportBar
                source={audio.source}
                isPlaying={audio.isPlaying}
                currentTime={audio.currentTime}
                duration={audio.duration}
                volume={audio.volume}
                muted={audio.muted}
                onTogglePlay={audio.togglePlay}
                onSeek={audio.seek}
                onVolumeChange={(volume) => {
                  if (audio.muted) audio.setMuted(false);
                  audio.setVolume(volume);
                }}
                onToggleMute={audio.toggleMute}
                onStopCapture={source.clear}
                trailing={
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                    title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
                    className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-md hover:bg-torus-raised hover:text-torus-fg"
                  >
                    <FullscreenIcon />
                  </button>
                }
              />
            </div>
          ) : null}

          <input
            ref={fileInputRef}
            type="file"
            accept={AUDIO_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) source.loadFile(file);
              e.target.value = '';
            }}
          />
        </section>
      </div>

      <ShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        hasFileSource={hasFileSource}
      />
      <DesktopAudioGuide
        open={source.desktopGuideOpen}
        reducedMotion={reducedMotion}
        onClose={source.closeDesktopGuide}
        onPick={source.startDesktopCapture}
      />
      {source.youtubeVideoId ? (
        <YouTubePanel
          videoId={source.youtubeVideoId}
          capturing={audio.source?.kind === 'youtube'}
          error={source.kind === 'youtube' ? audio.error : null}
          onCapture={() => void audio.startYouTube()}
          onStopCapture={audio.clearSource}
          onClose={source.closeYouTube}
        />
      ) : null}
      {exporter.prerender.rootMount ? <PrerenderRoot {...exporter.prerender.rootMount} /> : null}
    </div>
  );
}
