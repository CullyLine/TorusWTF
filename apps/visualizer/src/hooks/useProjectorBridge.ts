'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { AudioMetrics, VisualImpulses } from '@torus/visualizers';
import {
  PROJECTOR_CHANNEL,
  type ProjectorMessage,
  type ProjectorStatePayload,
} from '@/lib/projectorSync';

interface UseProjectorBridgeOptions {
  /** Current look — memoize on [preset, palette, controls, background]. */
  state: ProjectorStatePayload;
  /** Freshest metrics object, mirrored out of the canvas every frame. */
  metricsRef: MutableRefObject<AudioMetrics | null>;
}

export interface UseProjectorBridgeResult {
  /** A projector window is connected and receiving frames. */
  projectorOpen: boolean;
  /** Open (or focus) the projector window. */
  openProjector: () => void;
  /** Forward a one-shot visual impulse so the projector punches too. */
  postImpulse: (field: keyof VisualImpulses, strength: number) => void;
}

/**
 * Main-window half of the projector link: listens for projector hellos,
 * answers with the current look, streams metrics while one is connected,
 * and re-broadcasts state whenever it changes.
 */
export function useProjectorBridge({
  state,
  metricsRef,
}: UseProjectorBridgeOptions): UseProjectorBridgeResult {
  const [projectorOpen, setProjectorOpen] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(PROJECTOR_CHANNEL);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<ProjectorMessage>) => {
      const msg = event.data;
      if (msg.type === 'hello') {
        setProjectorOpen(true);
        channel.postMessage({ type: 'state', state: stateRef.current } satisfies ProjectorMessage);
      } else if (msg.type === 'bye') {
        setProjectorOpen(false);
      }
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []);

  // Push the look on every change while a projector is listening.
  useEffect(() => {
    if (!projectorOpen) return;
    channelRef.current?.postMessage({ type: 'state', state } satisfies ProjectorMessage);
  }, [projectorOpen, state]);

  // Metrics stream — one message per animation frame while connected.
  // ~30 numbers per message; BroadcastChannel handles this easily.
  useEffect(() => {
    if (!projectorOpen) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const m = metricsRef.current;
      if (m) {
        channelRef.current?.postMessage({ type: 'metrics', metrics: m } satisfies ProjectorMessage);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [projectorOpen, metricsRef]);

  const openProjector = useCallback(() => {
    // Named target: clicking again focuses the existing projector window
    // instead of spawning duplicates.
    window.open('/projector', 'torus-projector', 'width=1280,height=720');
  }, []);

  const postImpulse = useCallback((field: keyof VisualImpulses, strength: number) => {
    channelRef.current?.postMessage({
      type: 'impulse',
      field,
      strength,
    } satisfies ProjectorMessage);
  }, []);

  return { projectorOpen, openProjector, postImpulse };
}
