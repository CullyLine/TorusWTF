'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  advanceGovernor,
  createGovernorState,
  resolutionScaleFor,
  type GovernorConfig,
} from './governor';

export interface AdaptiveResolutionProps {
  /**
   * Called when the governor settles on a new resolution scale. The caller
   * owns the value and feeds it back as the Canvas `dpr` prop.
   *
   * Setting the renderer's pixel ratio imperatively does not survive here:
   * R3F re-applies its `dpr` prop on every commit, and that prop defaults to
   * `[1, 2]` rather than to nothing, so an imperative `setDpr` is undone
   * within a frame or two. Reporting upward keeps React the single owner.
   */
  onScaleChange: (scale: number) => void;
  enabled?: boolean;
  config?: GovernorConfig;
}

/**
 * Holds the frame budget by trading resolution for smoothness.
 *
 * Stays off for offline pre-render and live recording: both pin a pixel ratio
 * deliberately, and an export whose resolution drifts mid-render is worse
 * than a slow one.
 */
export function AdaptiveResolution({ onScaleChange, enabled = true, config }: AdaptiveResolutionProps) {
  const state = useMemo(() => createGovernorState(), []);
  const appliedStep = useRef(0);
  const lastTime = useRef(0);

  useEffect(() => {
    // Reset on the way in and out. On the way out this hands back full
    // resolution, so a session that degraded during recording does not stay
    // degraded afterwards.
    state.step = 0;
    state.slowFrames = 0;
    state.fastFrames = 0;
    appliedStep.current = 0;
    lastTime.current = 0;
    onScaleChange(1);
  }, [enabled, onScaleChange, state]);

  useFrame(() => {
    if (!enabled) return;
    const now = performance.now();
    const previous = lastTime.current;
    lastTime.current = now;
    if (previous === 0) return;

    advanceGovernor(state, now - previous, config);
    if (state.step === appliedStep.current) return;
    appliedStep.current = state.step;
    onScaleChange(resolutionScaleFor(state));
  });

  return null;
}
