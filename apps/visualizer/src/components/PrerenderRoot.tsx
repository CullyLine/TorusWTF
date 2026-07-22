'use client';

import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { VisualizerCanvas } from '@torus/visualizers';
import type {
  CreaturePersonality,
  EmitterSettings,
  ModRouting,
  RootState,
  ScreenEffectSettings,
  VisualizerId,
} from '@torus/visualizers';
import type { WaveformPalette } from '@torus/shared';
import type { SyntheticAnalyser } from '@/lib/prerender/syntheticAnalyser';
import type { BackgroundSettings, VisualizerControls } from '@/lib/storage';

/**
 * Offscreen R3F canvas used by the pre-render pipeline. Rendered into a
 * fixed-position container far off-screen at the exact export dimensions.
 *
 * The R3F frame loop is set to `'never'` — the orchestrator calls
 * `state.advance(songTimeSec)` once per output frame, which invokes every
 * `useFrame` callback (AudioMetricsProvider, SceneRig, the preset) and
 * then renders to the WebGL canvas. The canvas is created with
 * `preserveDrawingBuffer: true` so `new VideoFrame(canvas, …)` can read
 * the rendered pixels.
 *
 * The orchestrator is responsible for setting the synthetic analyser's
 * `currentFrameIndex`, the BPM ref, and the last-onset ref *before*
 * calling `advance`. This component just mounts the visualizer in
 * pre-render mode and reports the R3F state up.
 */

interface PrerenderRootProps {
  active: boolean;
  width: number;
  height: number;
  preset: VisualizerId;
  palette: WaveformPalette;
  controls: VisualizerControls;
  screenEffect: ScreenEffectSettings;
  emitter: EmitterSettings;
  modMatrix: ModRouting[];
  creature?: CreaturePersonality;
  syntheticAnalyser: SyntheticAnalyser;
  bpmRef: MutableRefObject<number | null>;
  lastOnsetRef: MutableRefObject<number>;
  background?: BackgroundSettings;
  onReady: (handle: { state: RootState; canvas: HTMLCanvasElement }) => void;
  /** Called if the canvas unmounts mid-render (cleanup / cancel). */
  onTeardown?: () => void;
}

export function PrerenderRoot({
  active,
  width,
  height,
  preset,
  palette,
  controls,
  screenEffect,
  emitter,
  modMatrix,
  creature,
  syntheticAnalyser,
  bpmRef,
  lastOnsetRef,
  background,
  onReady,
  onTeardown,
}: PrerenderRootProps) {
  useEffect(() => {
    if (!active) return undefined;
    return () => {
      onTeardown?.();
    };
  }, [active, onTeardown]);

  if (!active) return null;

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        left: -99999,
        top: -99999,
        width,
        height,
        pointerEvents: 'none',
        opacity: 0,
      }}
    >
      <VisualizerCanvas
        preset={preset}
        palette={palette}
        forceTier="high"
        embedded={false}
        exportSize={{ width, height }}
        pixelRatio={1}
        analyserOverride={syntheticAnalyser}
        reactivity={controls.reactivity}
        bassMix={controls.bassMix}
        midMix={controls.midMix}
        highMix={controls.highMix}
        speed={controls.speed}
        smoothness={controls.smoothness}
        linger={controls.linger ?? 0.3}
        scale={controls.scale}
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
        screenEffect={screenEffect.id}
        shaderMix={screenEffect.mix}
        emitterSettings={emitter}
        energy={controls.energy ?? 0}
        autoGain={controls.autoGain ?? true}
        colorLife={controls.colorLife ?? 0.6}
        background={background?.mode ?? 'none'}
        backgroundIntensity={background?.intensity ?? 0.6}
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
        modMatrix={modMatrix}
        creature={creature}
        bpmRef={bpmRef}
        lastOnsetRef={lastOnsetRef}
        frameloop="never"
        glOverrides={{ preserveDrawingBuffer: true }}
        onR3FState={(state) => {
          onReady({ state, canvas: state.gl.domElement });
        }}
      />
    </div>
  );
}
