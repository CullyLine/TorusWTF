'use client';

import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { VisualizerCanvas } from '@torus/visualizers';
import type { VisualizerId, CreaturePersonality, RootState } from '@torus/visualizers';
import type { WaveformPalette } from '@torus/shared';
import type { SyntheticAnalyser } from '@/lib/prerender/syntheticAnalyser';
import type { VisualizerControls } from '@/lib/storage';

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
  creature?: CreaturePersonality;
  syntheticAnalyser: SyntheticAnalyser;
  bpmRef: MutableRefObject<number | null>;
  lastOnsetRef: MutableRefObject<number>;
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
  creature,
  syntheticAnalyser,
  bpmRef,
  lastOnsetRef,
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
        scale={controls.scale}
        bassShake={controls.bassShake ?? 0}
        bassMaxHz={controls.bassMaxHz ?? 250}
        midMaxHz={controls.midMaxHz ?? 2000}
        anima={controls.anima ?? 0.5}
        aura={controls.aura ?? 0.4}
        cinematicSpeed={controls.cinematicSpeed ?? 1}
        energy={controls.energy ?? 0}
        bloomIntensity={controls.bloomIntensity}
        cameraMode={controls.cameraMode}
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
