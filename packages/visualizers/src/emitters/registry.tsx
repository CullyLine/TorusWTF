'use client';

import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';
import { BubbleEmitter } from './BubbleEmitter';
import {
  BUBBLE_TIER_BUDGETS,
  BUBBLE_TIER_BURST_LIMITS,
  DEFAULT_BUBBLE_EMITTER_SETTINGS,
  DEFAULT_EMITTER_SETTINGS,
  EMITTER_CONTROLS,
  resolveEmitterSettings,
} from './settings';
import type {
  EmitterDefinition,
  EmitterKind,
  EmitterLayerProps,
  EmitterModulationRef,
  EmitterRendererProps,
} from './types';

/** `none` consumes requests instead of letting a stale burst queue up. */
function InactiveEmitter({ impulses }: EmitterRendererProps) {
  useFrame(() => {
    if (impulses && impulses.emitterBurst !== 0) impulses.emitterBurst = 0;
  });
  return null;
}

export const EMITTER_REGISTRY: Readonly<Record<EmitterKind, EmitterDefinition>> = Object.freeze({
  none: {
    id: 'none',
    label: 'None',
    hint: 'No global particles',
    Renderer: InactiveEmitter,
    defaults: DEFAULT_EMITTER_SETTINGS,
    controls: Object.freeze([]),
    tierBudgets: BUBBLE_TIER_BUDGETS,
    tierBurstLimits: BUBBLE_TIER_BURST_LIMITS,
  },
  bubbles: {
    id: 'bubbles',
    label: 'Soap bubbles',
    hint: 'Iridescent bubbles rising through the shared musical current',
    Renderer: BubbleEmitter,
    defaults: DEFAULT_BUBBLE_EMITTER_SETTINGS,
    controls: EMITTER_CONTROLS,
    tierBudgets: BUBBLE_TIER_BUDGETS,
    tierBurstLimits: BUBBLE_TIER_BURST_LIMITS,
  },
});

export const EMITTER_KINDS: readonly EmitterKind[] = Object.freeze(['none', 'bubbles']);

export function isEmitterKind(value: unknown): value is EmitterKind {
  return value === 'none' || value === 'bubbles';
}

export function getEmitterDefinition(kind: EmitterKind): EmitterDefinition {
  return EMITTER_REGISTRY[kind];
}

/**
 * The only scene-graph mount integration needs. Place it inside the existing
 * AudioMetricsProvider and ModulationProvider, alongside the active preset.
 */
export function EmitterLayer({
  settings,
  palette,
  tier,
  impulses,
  modulationRef,
}: EmitterLayerProps) {
  const metricsRef = useMetricsRef();
  const sharedModulationRef = useModulation() as unknown as EmitterModulationRef;
  const resolvedSettings = useMemo(
    () => resolveEmitterSettings(settings, tier),
    [settings, tier],
  );
  const definition = EMITTER_REGISTRY[resolvedSettings.kind];
  const Renderer = definition.Renderer;

  return (
    <Renderer
      settings={resolvedSettings}
      palette={palette}
      tier={tier}
      metricsRef={metricsRef}
      modulationRef={modulationRef ?? sharedModulationRef}
      impulses={impulses}
    />
  );
}
