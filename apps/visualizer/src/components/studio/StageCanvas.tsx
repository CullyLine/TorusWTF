'use client';

import dynamic from 'next/dynamic';
import type { MutableRefObject } from 'react';
import type { AudioMetrics, Creature, createImpulses } from '@torus/visualizers';
import type { useAudioSource } from '@/hooks/useAudioSource';
import type { UseBPMResult } from '@/hooks/useBPM';
import type { Look } from '@/hooks/useLook';

// Three.js needs a browser, so the canvas is loaded on the client only.
const VisualizerCanvas = dynamic(
  () => import('@torus/visualizers').then((m) => m.VisualizerCanvas),
  { ssr: false },
);

interface StageCanvasProps {
  audio: Pick<ReturnType<typeof useAudioSource>, 'source' | 'audioRef' | 'analyser'>;
  look: Look;
  /** While exporting, render at this pixel size instead of the preview size. */
  exportSize?: { width: number; height: number };
  creature?: Creature['personality'];
  bpmRef: UseBPMResult['bpmRef'];
  lastOnsetRef: UseBPMResult['lastOnsetRef'];
  /** One-shot visual commands, consumed by the canvas in its frame loop. */
  impulses: ReturnType<typeof createImpulses>;
  /** The canvas writes its newest audio metrics here every frame. */
  metricsOutRef: MutableRefObject<AudioMetrics | null>;
  onCanvasReady: (canvas: HTMLCanvasElement) => void;
}

/**
 * The live visualizer canvas, fed from the current look. A control missing
 * from older saved state falls back to the value it had before it existed,
 * the same values `controlsFromSavedPreset` uses.
 */
export function StageCanvas({
  audio,
  look,
  exportSize,
  creature,
  bpmRef,
  lastOnsetRef,
  impulses,
  metricsOutRef,
  onCanvasReady,
}: StageCanvasProps) {
  const { controls } = look;
  const isFile = audio.source?.kind === 'file';

  return (
    <VisualizerCanvas
      // A file plays through the audio element. A live capture has its own analyser.
      audioRef={isFile ? audio.audioRef : undefined}
      analyserOverride={isFile ? undefined : audio.analyser}
      preset={look.preset}
      palette={look.palette}
      embedded={false}
      exportSize={exportSize}
      pixelRatio={exportSize ? 1 : undefined}
      onGlCanvasReady={onCanvasReady}
      reactivity={controls.reactivity}
      bassMix={controls.bassMix}
      midMix={controls.midMix}
      highMix={controls.highMix}
      speed={controls.speed}
      smoothness={controls.smoothness ?? 0}
      linger={controls.linger ?? 0.3}
      scale={controls.scale ?? 1}
      bassShake={controls.bassShake ?? 0}
      depthOfField={controls.depthOfField ?? 0}
      bassMaxHz={controls.bassMaxHz ?? 250}
      midMaxHz={controls.midMaxHz ?? 2000}
      anima={controls.anima ?? 0.5}
      aura={controls.aura ?? 0.4}
      cinematicSpeed={controls.cinematicSpeed ?? 1}
      cameraDistance={controls.cameraDistance ?? 1}
      lightLevel={controls.lightLevel ?? 1}
      highlightProtection={controls.highlightProtection ?? true}
      screenEffect={look.screenEffect.id}
      shaderMix={look.screenEffect.mix}
      emitterSettings={look.emitter}
      energy={controls.energy ?? 0}
      autoGain={controls.autoGain ?? true}
      colorLife={controls.colorLife ?? 0.6}
      saturation={controls.saturation ?? 1.1}
      background={look.background.mode}
      backgroundIntensity={look.background.intensity}
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
      creature={creature}
      bpmRef={bpmRef}
      lastOnsetRef={lastOnsetRef}
      impulses={impulses}
      metricsOutRef={metricsOutRef}
      modMatrix={look.modMatrix}
    />
  );
}
