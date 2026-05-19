'use client';

import { useMemo, type RefObject } from 'react';
import { Canvas } from '@react-three/fiber';
import { useAudioAnalyser } from './audio';
import { detectTier } from './tier';
import { VISUALIZERS, type VisualizerId } from './registry';
import { AudioMetricsProvider } from './metrics';
import { SceneRig } from './SceneRig';
import { CameraZoomProvider, VisualizerZoomSurface } from './cameraZoom';

interface VisualizerCanvasProps {
  audioRef: RefObject<HTMLAudioElement | null>;
  preset: VisualizerId;
  palette: { bass: string; mid: string; high: string };
  forceTier?: 'high' | 'mid' | 'low';
  /** Embedded in the waveform panel (not fullscreen). */
  embedded?: boolean;
  /** Wheel / pinch zoom — also used to reveal overlay chrome. */
  onInteract?: () => void;
}

export function VisualizerCanvas({
  audioRef,
  preset,
  palette,
  forceTier,
  embedded = false,
  onInteract,
}: VisualizerCanvasProps) {
  const tier = useMemo(() => forceTier ?? detectTier(), [forceTier]);
  const analyser = useAudioAnalyser(audioRef.current, tier === 'low' ? 256 : 1024);
  const def = VISUALIZERS[preset] ?? VISUALIZERS.torus_field;
  const defaultZ = embedded ? 3.2 : 4;

  return (
    <CameraZoomProvider embedded={embedded}>
      <VisualizerZoomSurface onInteract={onInteract}>
        <Canvas
          camera={{ position: [0, 0, defaultZ], fov: embedded ? 55 : 50 }}
          dpr={tier === 'high' ? [1, 2] : 1}
          gl={{ antialias: tier !== 'low', powerPreference: 'high-performance', alpha: true }}
          style={{ width: '100%', height: '100%', background: 'transparent' }}
        >
          <color attach="background" args={['#0a0b1e']} />
          <AudioMetricsProvider analyser={analyser}>
            <SceneRig palette={palette} tier={tier} embedded={embedded} />
            <def.Scene analyser={analyser} palette={palette} tier={tier} />
          </AudioMetricsProvider>
        </Canvas>
      </VisualizerZoomSurface>
    </CameraZoomProvider>
  );
}
