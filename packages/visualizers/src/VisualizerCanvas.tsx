'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from 'react';
import { Canvas, useFrame, useThree, type RootState } from '@react-three/fiber';
import type { Group } from 'three';

export type { RootState } from '@react-three/fiber';
import { useAudioAnalyser } from './audio';
import { detectTier } from './tier';
import { VISUALIZERS, type VisualizerId } from './registry';
import { BackgroundLayer, type BackgroundMode } from './BackgroundLayer';
import { AudioMetricsProvider, type AudioMetrics, type MetricsScales } from './metrics';
import type { VisualImpulses } from './impulse';
import { LivingPaletteDriver, type LivingPaletteTarget } from './livingPalette';
import { ModulationProvider, useModulation, type ModRouting, type ModulatedValues } from './modulation';
import { SceneRig, type CameraMode } from './SceneRig';
import { CameraZoomProvider, VisualizerZoomSurface } from './cameraZoom';
import type { AnalyserHandle } from './audio';
import type { CreaturePersonality } from './dsp/creature';
import type { ScreenEffectId } from './effects/screenEffects';
import { EmitterLayer } from './emitters/registry';
import { DEFAULT_EMITTER_SETTINGS } from './emitters/settings';
import type { EmitterSettings } from './emitters/types';

/** Soft dissolve when switching presets — long enough to read, short enough to stay snappy. */
const PRESET_CROSSFADE_MS = 350;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

/**
 * After the WebGL scene paints, copy the canvas into a 2D ghost overlay so
 * the outgoing frame can dissolve over the newly mounted preset.
 */
function CrossfadeCapture({
  armRef,
  onCaptured,
}: {
  armRef: MutableRefObject<boolean>;
  onCaptured: (source: HTMLCanvasElement) => void;
}) {
  const glCanvas = useThree((s) => s.gl.domElement);
  useFrame(() => {
    if (!armRef.current) return;
    armRef.current = false;
    onCaptured(glCanvas);
  }, -1);
  return null;
}

export interface VisualizerCanvasProps {
  audioRef?: RefObject<HTMLAudioElement | null>;
  /** When set, overrides the analyser from audioRef (mic/tab sources). */
  analyserOverride?: AnalyserHandle | null;
  preset: VisualizerId;
  palette: { bass: string; mid: string; high: string };
  forceTier?: 'high' | 'mid' | 'low';
  /** Embedded in the waveform panel (not fullscreen). */
  embedded?: boolean;
  /** Wheel / pinch zoom — also used to reveal overlay chrome. */
  onInteract?: () => void;
  /** Optional export dimensions (width x height in px). */
  exportSize?: { width: number; height: number };
  /** Pixel ratio override for export quality. */
  pixelRatio?: number;
  /** Called when the WebGL canvas is ready (for export compositing). */
  onGlCanvasReady?: (canvas: HTMLCanvasElement) => void;
  /**
   * R3F render loop mode. Default 'always'. Set to 'never' for offline
   * pre-rendering where the caller drives `state.advance()` manually.
   */
  frameloop?: 'always' | 'never' | 'demand';
  /**
   * Optional WebGL context overrides applied via `gl` prop. Used by the
   * pre-render canvas to enable `preserveDrawingBuffer` so VideoFrame
   * can capture the rendered pixels.
   */
  glOverrides?: Record<string, unknown>;
  /** Receives the R3F root state once the canvas is created. */
  onR3FState?: (state: RootState) => void;
  reactivity?: number;
  bassMix?: number;
  midMix?: number;
  highMix?: number;
  speed?: number;
  smoothness?: number;
  bloomIntensity?: number;
  cameraMode?: CameraMode;
  /** Multiplies the rendered scene size. 1 = default. */
  scale?: number;
  /** Subwoofer-style camera rumble keyed to bass. 0 = off, 1 = noticeable, 3 = car shaking. */
  bassShake?: number;
  /** Hidden per-browser personality vector that subtly biases reactivity. */
  creature?: CreaturePersonality;
  /** Upper edge of the bass band in Hz. */
  bassMaxHz?: number;
  /** Upper edge of the mid band in Hz. */
  midMaxHz?: number;
  /** BPM ref from useBPM, drives beat/bar phase uniforms. */
  bpmRef?: MutableRefObject<number | null>;
  /** Last onset timestamp ref from useBPM, anchors beat/bar phase. */
  lastOnsetRef?: MutableRefObject<number>;
  /** Anima life amount. 0 = dead-reactive, 1 = full breathing. */
  anima?: number;
  /** Aura amount. 0 = no wisps/glow, 1 = full presence. */
  aura?: number;
  /** Cinematic playback rate (only used when cameraMode === 'cinematic'). */
  cinematicSpeed?: number;
  /** Camera distance multiplier. 1 = natural framing; never goes inside the safe zone. */
  cameraDistance?: number;
  /** Global light level. 1 = default; <1 dims the frame, >1 brightens. */
  lightLevel?: number;
  /** Final hue-preserving highlight compression. Default on. */
  highlightProtection?: boolean;
  /** Whole-frame post-processing style. Default none. */
  screenEffect?: ScreenEffectId;
  /** Selected screen style wet/dry amount. 0 = original frame, 1 = full style. */
  shaderMix?: number;
  /** One global emitter layer, disabled by the factory `none` setting. */
  emitterSettings?: EmitterSettings;
  /** Dynamic-range expansion. 0 = unchanged, 1 = peaks 3x their deviation. */
  energy?: number;
  /** Auto-gain (AGC). Default on; normalizes loudness so any song reacts well. */
  autoGain?: boolean;
  /** Liquid Blob: 0 = pure stretch, 1 = pure inflate. Other presets ignore. */
  inflate?: number;
  /** Liquid Blob: number of orbiting satellite spheres (0–10). */
  appendages?: number;
  /** Liquid Blob: max sub-spheres that pop on high-frequency transients (0–8). */
  subSpheres?: number;
  /** Flow Field: fine turbulent detail 0..2. */
  turbulence?: number;
  /** Flow Field: trail length 0..2. */
  trailLength?: number;
  /** Flow Field: fraction of particles rendered 0..1. */
  density?: number;
  /** Flow Field: tornado vortex strength 0..1. */
  vortexAmount?: number;
  /** Flow Field: pointer-stir strength 0..2. */
  interactStrength?: number;
  /**
   * Living-color amount. 0 = palette stays exactly as picked; 1 = full
   * breathing color (hue drift, loudness saturation, drop hue-kicks).
   */
  colorLife?: number;
  /**
   * Optional reactive background behind the preset. Default 'none' keeps the
   * clip player and all current presets unchanged. Skipped automatically for
   * fullscreen-shader presets that would occlude it.
   */
  background?: BackgroundMode;
  /** Background visibility 0..1. Default 0.6. */
  backgroundIntensity?: number;
  /**
   * 0..1 — how long big moments echo after they pass. Stretches only the
   * release side of the musical envelopes; hits still land instantly.
   */
  linger?: number;
  /**
   * Modulation matrix routings — continuous audio-signal → control-value
   * mappings computed per frame inside the canvas. See `modulation.tsx`.
   */
  modMatrix?: ModRouting[];
  /**
   * One-shot visual commands (trigger mappings / MIDI). Mutable object with
   * a stable identity; the rig and palette driver consume fields per frame.
   */
  impulses?: VisualImpulses;
  /**
   * Receives the freshest AudioMetrics object every frame — for consumers
   * outside the canvas (trigger engine, projector broadcast).
   */
  metricsOutRef?: MutableRefObject<AudioMetrics | null>;
  /**
   * Remote-driven mode (projector window): metrics are read from this ref
   * instead of being computed from an analyser.
   */
  externalMetricsRef?: MutableRefObject<AudioMetrics | null>;
}

export function VisualizerCanvas({
  audioRef,
  analyserOverride,
  preset,
  palette,
  forceTier,
  embedded = false,
  onInteract,
  exportSize,
  pixelRatio,
  onGlCanvasReady,
  reactivity,
  bassMix,
  midMix,
  highMix,
  speed,
  smoothness,
  bloomIntensity,
  cameraMode,
  scale = 1,
  bassShake = 0,
  creature,
  bassMaxHz,
  midMaxHz,
  bpmRef,
  lastOnsetRef,
  anima,
  aura,
  cinematicSpeed = 1,
  cameraDistance = 1,
  lightLevel = 1,
  highlightProtection = true,
  screenEffect = 'none',
  shaderMix = 1,
  emitterSettings = DEFAULT_EMITTER_SETTINGS,
  energy,
  autoGain,
  inflate,
  appendages,
  subSpheres,
  turbulence,
  trailLength,
  density,
  vortexAmount,
  interactStrength,
  colorLife = 0.6,
  background = 'none',
  backgroundIntensity = 0.6,
  linger = 0.3,
  modMatrix,
  impulses,
  metricsOutRef,
  externalMetricsRef,
  frameloop = 'always',
  glOverrides,
  onR3FState,
}: VisualizerCanvasProps) {
  const tier = useMemo(() => forceTier ?? detectTier(), [forceTier]);
  const fftSize = tier === 'low' ? 256 : 1024;
  const audioAnalyser = useAudioAnalyser(audioRef?.current ?? null, fftSize);
  const analyser = analyserOverride ?? audioAnalyser;
  const defaultZ = embedded ? 2.8 : 3.1;
  const reducedMotion = usePrefersReducedMotion();

  // Mounted preset lags the prop by one painted frame so we can freeze the
  // outgoing look into a ghost overlay, then dissolve it over the new scene.
  const [activePreset, setActivePreset] = useState(preset);
  const activePresetRef = useRef(preset);
  const pendingPresetRef = useRef<VisualizerId | null>(null);
  const captureArmRef = useRef(false);
  const ghostCanvasRef = useRef<HTMLCanvasElement>(null);
  const fadeRafRef = useRef<number | null>(null);
  const [ghostOpacity, setGhostOpacity] = useState(0);

  const def = VISUALIZERS[activePreset] ?? VISUALIZERS.torus_field;

  const cancelGhostFade = useCallback(() => {
    if (fadeRafRef.current != null) {
      cancelAnimationFrame(fadeRafRef.current);
      fadeRafRef.current = null;
    }
  }, []);

  const handleCaptured = useCallback(
    (source: HTMLCanvasElement) => {
      const next = pendingPresetRef.current;
      if (!next) return;
      pendingPresetRef.current = null;

      const ghost = ghostCanvasRef.current;
      if (ghost) {
        ghost.width = source.width;
        ghost.height = source.height;
        const ctx = ghost.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, ghost.width, ghost.height);
          ctx.drawImage(source, 0, 0);
        }
      }

      activePresetRef.current = next;
      setActivePreset(next);
      setGhostOpacity(1);

      cancelGhostFade();
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / PRESET_CROSSFADE_MS);
        // Ease-out cubic — quick handoff, soft landing.
        const eased = 1 - (1 - t) ** 3;
        setGhostOpacity(1 - eased);
        if (t < 1) {
          fadeRafRef.current = requestAnimationFrame(tick);
        } else {
          fadeRafRef.current = null;
          setGhostOpacity(0);
          const g = ghostCanvasRef.current;
          const gctx = g?.getContext('2d');
          if (g && gctx) gctx.clearRect(0, 0, g.width, g.height);
        }
      };
      fadeRafRef.current = requestAnimationFrame(tick);
    },
    [cancelGhostFade],
  );

  useEffect(() => {
    if (preset === activePresetRef.current && pendingPresetRef.current == null) return;

    if (reducedMotion || frameloop === 'never') {
      cancelGhostFade();
      pendingPresetRef.current = null;
      captureArmRef.current = false;
      activePresetRef.current = preset;
      setActivePreset(preset);
      setGhostOpacity(0);
      return;
    }

    if (preset === activePresetRef.current) return;

    pendingPresetRef.current = preset;
    captureArmRef.current = true;
  }, [preset, reducedMotion, frameloop, cancelGhostFade]);

  useEffect(() => () => cancelGhostFade(), [cancelGhostFade]);

  // Stable identity, mutated per-frame by LivingPaletteDriver (which reads
  // the base palette fresh each frame). Everything inside the canvas reads
  // colors from this object so the whole scene — lights, backgrounds,
  // preset shaders — breathes together.
  // Intentionally empty deps: identity must stay stable while the driver
  // mutates the fields; the base palette is re-read fresh each frame.
  const livingPalette = useMemo<LivingPaletteTarget>(
    () => ({ bass: palette.bass, mid: palette.mid, high: palette.high }),
    [],
  );

  const metricsScales: MetricsScales = {
    reactivity,
    bassMix,
    midMix,
    highMix,
    speed,
    smoothness,
    creature,
    bassMaxHz,
    midMaxHz,
    bpmRef,
    lastOnsetRef,
    energy,
    autoGain,
    linger,
    metricsOutRef,
    externalMetricsRef,
  };

  // Base values the modulation matrix modulates AROUND — the current slider
  // positions. Rebuilt on render (slider edits), read per frame by the driver.
  const modBase: ModulatedValues = {
    speed,
    scale,
    bloomIntensity,
    lightLevel,
    shaderMix,
    colorLife,
    cameraDistance,
    bassShake,
    cinematicSpeed,
    emitterRate: emitterSettings.rate,
    emitterSize: emitterSettings.size,
    emitterLifetime: emitterSettings.lifetime,
    emitterLift: emitterSettings.lift,
    emitterSpread: emitterSettings.spread,
    emitterTurbulence: emitterSettings.turbulence,
    emitterOpacity: emitterSettings.opacity,
    inflate,
    turbulence,
    trailLength,
    density,
    vortexAmount,
    interactStrength,
  };

  const containerStyle = exportSize
    ? {
        position: 'relative' as const,
        width: exportSize.width,
        height: exportSize.height,
      }
    : { position: 'relative' as const, width: '100%', height: '100%' };

  return (
    <CameraZoomProvider embedded={embedded}>
      <VisualizerZoomSurface onInteract={onInteract}>
        <div style={containerStyle}>
          <Canvas
            camera={{ position: [0, 0, defaultZ], fov: embedded ? 55 : 50 }}
            dpr={pixelRatio ?? (tier === 'high' ? [1, 2] : 1)}
            gl={{
              antialias: tier !== 'low',
              powerPreference: 'high-performance',
              alpha: true,
              // Needed so the post-render ghost capture can read pixels.
              preserveDrawingBuffer: true,
              ...(glOverrides ?? {}),
            }}
            frameloop={frameloop}
            style={{ width: '100%', height: '100%', background: 'transparent' }}
            onCreated={(state) => {
              onGlCanvasReady?.(state.gl.domElement);
              onR3FState?.(state);
            }}
          >
            <color attach="background" args={['#0a0b1e']} />
            <CrossfadeCapture armRef={captureArmRef} onCaptured={handleCaptured} />
            <AudioMetricsProvider analyser={analyser} {...metricsScales}>
              <ModulationProvider routings={modMatrix} base={modBase}>
                <LivingPaletteDriver
                  base={palette}
                  out={livingPalette}
                  amount={colorLife}
                  impulses={impulses}
                />
                <EmitterLayer
                  settings={emitterSettings}
                  palette={livingPalette}
                  tier={tier}
                  impulses={impulses}
                />
                <SceneRig
                  palette={livingPalette}
                  tier={tier}
                  embedded={embedded}
                  bloomIntensity={bloomIntensity}
                  cameraMode={cameraMode}
                  bassShake={bassShake}
                  anima={anima}
                  aura={aura}
                  creature={creature}
                  cinematicSpeed={cinematicSpeed}
                  cameraDistance={cameraDistance}
                  lightLevel={lightLevel}
                  highlightProtection={highlightProtection}
                  screenEffect={screenEffect}
                  shaderMix={shaderMix}
                  impulses={impulses}
                />
                {background !== 'none' ? (
                  <BackgroundLayer
                    mode={background}
                    intensity={backgroundIntensity}
                    palette={livingPalette}
                    tier={tier}
                  />
                ) : null}
                <ModulatedScaleGroup scale={scale}>
                  <def.Scene
                    analyser={analyser}
                    palette={livingPalette}
                    tier={tier}
                    scale={scale}
                    speed={speed}
                    inflate={inflate}
                    appendages={appendages}
                    subSpheres={subSpheres}
                    turbulence={turbulence}
                    trailLength={trailLength}
                    density={density}
                    vortexAmount={vortexAmount}
                    interactStrength={interactStrength}
                    backdrop={background !== 'none'}
                  />
                </ModulatedScaleGroup>
              </ModulationProvider>
            </AudioMetricsProvider>
          </Canvas>
          <canvas
            ref={ghostCanvasRef}
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              opacity: ghostOpacity,
              visibility: ghostOpacity > 0.001 ? 'visible' : 'hidden',
            }}
          />
        </div>
      </VisualizerZoomSurface>
    </CameraZoomProvider>
  );
}

/**
 * The scene-scale wrapper, made modulation-aware: reads the live `scale`
 * value from the mod matrix every frame (falling back to the slider prop)
 * so routings like "Kick → Size" physically pump the whole scene.
 */
function ModulatedScaleGroup({ scale, children }: { scale: number; children: ReactNode }) {
  const groupRef = useRef<Group>(null);
  const mods = useModulation();
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const s = mods.current.scale ?? scale;
    if (g.scale.x !== s) g.scale.setScalar(s);
  });
  return (
    <group ref={groupRef} scale={scale}>
      {children}
    </group>
  );
}
