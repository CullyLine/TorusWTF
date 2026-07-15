'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createImpulses, type AudioMetrics } from '@torus/visualizers';
import { Logo } from '@torus/ui';
import {
  PROJECTOR_CHANNEL,
  type ProjectorMessage,
  type ProjectorStatePayload,
} from '@/lib/projectorSync';

const VisualizerCanvas = dynamic(
  () => import('@torus/visualizers').then((m) => m.VisualizerCanvas),
  { ssr: false },
);

/**
 * The projector — a chromeless render surface meant to live on a second
 * screen (venue projector, capture card, stream overlay). No audio, no
 * controls: the main studio window streams state + metrics over a
 * BroadcastChannel and this window just draws. Double-click for fullscreen.
 */
export default function ProjectorPage() {
  const [look, setLook] = useState<ProjectorStatePayload | null>(null);
  const [live, setLive] = useState(false);
  const [cursorHidden, setCursorHidden] = useState(false);
  const externalMetricsRef = useRef<AudioMetrics | null>(null);
  const lastMetricsAtRef = useRef(0);
  const impulses = useMemo(() => createImpulses(), []);

  useEffect(() => {
    document.title = 'torus projector';
  }, []);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(PROJECTOR_CHANNEL);
    channel.onmessage = (event: MessageEvent<ProjectorMessage>) => {
      const msg = event.data;
      if (msg.type === 'state') {
        setLook(msg.state);
      } else if (msg.type === 'metrics') {
        externalMetricsRef.current = msg.metrics;
        lastMetricsAtRef.current = performance.now();
      } else if (msg.type === 'impulse') {
        impulses[msg.field] = Math.max(impulses[msg.field], msg.strength);
      }
    };
    const bye = () => channel.postMessage({ type: 'bye' } satisfies ProjectorMessage);
    channel.postMessage({ type: 'hello' } satisfies ProjectorMessage);
    window.addEventListener('beforeunload', bye);

    // Signal health: the studio streams metrics every frame, so a 2s gap
    // means it's paused, closed, or navigated away. While disconnected we
    // keep re-sending hello so the link forms no matter which window opened
    // first (or if the studio reloads).
    const health = window.setInterval(() => {
      const fresh = performance.now() - lastMetricsAtRef.current < 2000;
      setLive(fresh);
      if (!fresh) channel.postMessage({ type: 'hello' } satisfies ProjectorMessage);
    }, 500);

    return () => {
      window.removeEventListener('beforeunload', bye);
      window.clearInterval(health);
      bye();
      channel.close();
    };
  }, [impulses]);

  // Hide the cursor once the pointer settles — this window IS the show.
  useEffect(() => {
    let timeout = 0;
    const onMove = () => {
      setCursorHidden(false);
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => setCursorHidden(true), 2500);
    };
    onMove();
    window.addEventListener('pointermove', onMove);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.clearTimeout(timeout);
    };
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  };

  const controls = look?.controls;

  return (
    <div
      onDoubleClick={toggleFullscreen}
      className={`fixed inset-0 bg-[#0a0b1e] ${cursorHidden ? 'cursor-none' : ''}`}
    >
      {look && controls ? (
        <VisualizerCanvas
          preset={look.preset}
          palette={look.palette}
          embedded={false}
          externalMetricsRef={externalMetricsRef}
          impulses={impulses}
          reactivity={controls.reactivity}
          bassMix={controls.bassMix}
          midMix={controls.midMix}
          highMix={controls.highMix}
          speed={controls.speed}
          smoothness={controls.smoothness ?? 0}
          scale={controls.scale ?? 1}
          bassShake={controls.bassShake ?? 0}
          bassMaxHz={controls.bassMaxHz ?? 250}
          midMaxHz={controls.midMaxHz ?? 2000}
          anima={controls.anima ?? 0.5}
          aura={controls.aura ?? 0.4}
          cinematicSpeed={controls.cinematicSpeed ?? 1}
          cameraDistance={controls.cameraDistance ?? 1}
          lightLevel={controls.lightLevel ?? 1}
          energy={controls.energy ?? 0}
          autoGain={controls.autoGain ?? true}
          colorLife={controls.colorLife ?? 0.6}
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
        />
      ) : null}

      {!look || !live ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#0a0b1e]/80 text-center backdrop-blur-sm">
          <Logo size={40} href={null} color="var(--color-torus-mid)" />
          <div>
            <p className="text-sm font-medium text-torus-fg">
              {look ? 'Signal paused' : 'Waiting for the studio…'}
            </p>
            <p className="mt-1 max-w-xs text-xs text-torus-fg-dim">
              {look
                ? 'Play audio in the studio window to resume.'
                : 'Keep the torus visualizer open in another window and start some audio — this projector mirrors it.'}
            </p>
          </div>
          <p className="text-[10px] text-torus-fg-faint">Double-click for fullscreen</p>
        </div>
      ) : null}
    </div>
  );
}
