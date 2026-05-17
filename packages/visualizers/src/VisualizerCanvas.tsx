'use client';

import { useMemo, type RefObject } from 'react';
import { Canvas } from '@react-three/fiber';
import { useAudioAnalyser } from './audio';
import { detectTier } from './tier';
import { VISUALIZERS, type VisualizerId } from './registry';

interface VisualizerCanvasProps {
  /** The <audio> element backing playback. We hook a Web Audio analyser to it. */
  audioRef: RefObject<HTMLAudioElement | null>;
  /** Which preset to render. */
  preset: VisualizerId;
  /** Per-clip palette derived by the worker. */
  palette: { bass: string; mid: string; high: string };
  /** Override device tier (e.g. for forced quality). */
  forceTier?: 'high' | 'mid' | 'low';
}

/**
 * Mounts a fullscreen R3F Canvas with the chosen preset Scene inside.
 * Owns the AudioContext setup (via useAudioAnalyser) and the device-tier
 * detection — preset Scenes are pure renderers that consume both.
 */
export function VisualizerCanvas({ audioRef, preset, palette, forceTier }: VisualizerCanvasProps) {
  const tier = useMemo(() => forceTier ?? detectTier(), [forceTier]);
  const analyser = useAudioAnalyser(audioRef.current, tier === 'low' ? 256 : 1024);
  const def = VISUALIZERS[preset] ?? VISUALIZERS.torus_field;

  return (
    <Canvas
      camera={{ position: [0, 0, 4], fov: 50 }}
      dpr={tier === 'high' ? [1, 2] : 1}
      gl={{ antialias: tier !== 'low', powerPreference: 'high-performance' }}
      style={{ width: '100%', height: '100%' }}
    >
      <color attach="background" args={['#0a0b1e']} />
      <def.Scene analyser={analyser} palette={palette} tier={tier} />
    </Canvas>
  );
}
