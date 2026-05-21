'use client';

import { useMemo, type RefObject } from 'react';
import { Canvas } from '@react-three/fiber';
import { useAudioAnalyser } from './audio';
import { detectTier } from './tier';
import { VISUALIZERS, type VisualizerId } from './registry';
import { AudioMetricsProvider, type MetricsScales } from './metrics';
import { SceneRig, type CameraMode } from './SceneRig';
import { CameraZoomProvider, VisualizerZoomSurface } from './cameraZoom';
import type { AnalyserHandle } from './audio';

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
  reactivity?: number;
  bassMix?: number;
  midMix?: number;
  highMix?: number;
  speed?: number;
  bloomIntensity?: number;
  cameraMode?: CameraMode;
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
  bloomIntensity,
  cameraMode,
}: VisualizerCanvasProps) {
  const tier = useMemo(() => forceTier ?? detectTier(), [forceTier]);
  const fftSize = tier === 'low' ? 256 : 1024;
  const audioAnalyser = useAudioAnalyser(audioRef?.current ?? null, fftSize);
  const analyser = analyserOverride ?? audioAnalyser;
  const def = VISUALIZERS[preset] ?? VISUALIZERS.torus_field;
  const defaultZ = embedded ? 3.2 : 4;

  const metricsScales: MetricsScales = {
    reactivity,
    bassMix,
    midMix,
    highMix,
    speed,
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
            gl={{ antialias: tier !== 'low', powerPreference: 'high-performance', alpha: true }}
            style={{ width: '100%', height: '100%', background: 'transparent' }}
            onCreated={({ gl }) => {
              onGlCanvasReady?.(gl.domElement);
            }}
          >
            <color attach="background" args={['#0a0b1e']} />
            <AudioMetricsProvider analyser={analyser} {...metricsScales}>
              <SceneRig
                palette={palette}
                tier={tier}
                embedded={embedded}
                bloomIntensity={bloomIntensity}
                cameraMode={cameraMode}
              />
              <def.Scene analyser={analyser} palette={palette} tier={tier} />
            </AudioMetricsProvider>
          </Canvas>
        </div>
      </VisualizerZoomSurface>
    </CameraZoomProvider>
  );
}
