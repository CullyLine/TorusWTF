'use client';

import { useMemo, type MutableRefObject, type RefObject } from 'react';
import { Canvas, type RootState } from '@react-three/fiber';

export type { RootState } from '@react-three/fiber';
import { useAudioAnalyser } from './audio';
import { detectTier } from './tier';
import { VISUALIZERS, FULLSCREEN_SHADER_PRESETS, type VisualizerId } from './registry';
import { BackgroundLayer, type BackgroundMode } from './BackgroundLayer';
import { AudioMetricsProvider, type AudioMetrics, type MetricsScales } from './metrics';
import type { VisualImpulses } from './impulse';
import { LivingPaletteDriver, type LivingPaletteTarget } from './livingPalette';
import { SceneRig, type CameraMode } from './SceneRig';
import { CameraZoomProvider, VisualizerZoomSurface } from './cameraZoom';
import type { AnalyserHandle } from './audio';
import type { CreaturePersonality } from './dsp/creature';

interface VisualizerCanvasProps {
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
  const def = VISUALIZERS[preset] ?? VISUALIZERS.torus_field;
  const defaultZ = embedded ? 2.8 : 3.1;

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
    metricsOutRef,
    externalMetricsRef,
  };

  const containerStyle = exportSize
    ? { width: exportSize.width, height: exportSize.height }
    : { width: '100%', height: '100%' };

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
            <AudioMetricsProvider analyser={analyser} {...metricsScales}>
              <LivingPaletteDriver
                base={palette}
                out={livingPalette}
                amount={colorLife}
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
                impulses={impulses}
              />
              {background !== 'none' && !FULLSCREEN_SHADER_PRESETS.has(preset) ? (
                <BackgroundLayer
                  mode={background}
                  intensity={backgroundIntensity}
                  palette={livingPalette}
                  tier={tier}
                />
              ) : null}
              <group scale={scale}>
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
                />
              </group>
            </AudioMetricsProvider>
          </Canvas>
        </div>
      </VisualizerZoomSurface>
    </CameraZoomProvider>
  );
}
