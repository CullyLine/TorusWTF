import { describe, expect, it } from 'vitest';
import { EMITTER_KINDS, EMITTER_REGISTRY, getEmitterDefinition } from './registry';
import {
  BUBBLE_TIER_BUDGETS,
  BUBBLE_TIER_BURST_LIMITS,
  DEFAULT_BUBBLE_EMITTER_SETTINGS,
  DEFAULT_EMITTER_SETTINGS,
  resolveEmitterRuntimeSettings,
  resolveEmitterSettings,
  sanitizeEmitterSettings,
} from './settings';
import type { EmitterContinuousSettings } from './types';

describe('emitter contract', () => {
  it('keeps none and bubbles in one stable registry', () => {
    expect(EMITTER_KINDS).toEqual(['none', 'bubbles']);
    expect(DEFAULT_EMITTER_SETTINGS.kind).toBe('none');
    expect(getEmitterDefinition('bubbles')).toBe(EMITTER_REGISTRY.bubbles);
    expect(EMITTER_REGISTRY.bubbles.defaults).toBe(DEFAULT_BUBBLE_EMITTER_SETTINGS);
    expect(EMITTER_REGISTRY.bubbles.controls.map((control) => control.key)).toEqual([
      'emitterRate',
      'emitterSize',
      'emitterLifetime',
      'emitterLift',
      'emitterSpread',
      'emitterTurbulence',
      'emitterOpacity',
    ]);
  });

  it('caps requested particle and burst budgets to each tier', () => {
    const requested = {
      ...DEFAULT_BUBBLE_EMITTER_SETTINGS,
      particleBudget: BUBBLE_TIER_BUDGETS.high,
    };

    for (const tier of ['low', 'mid', 'high'] as const) {
      const resolved = resolveEmitterSettings(requested, tier);
      expect(resolved.particleBudget).toBe(BUBBLE_TIER_BUDGETS[tier]);
      expect(resolved.burstLimit).toBe(BUBBLE_TIER_BURST_LIMITS[tier]);
    }
  });

  it('sanitizes persisted values and clamps live modulation', () => {
    const sanitized = sanitizeEmitterSettings({
      kind: 'unknown',
      seed: -1,
      particleBudget: Number.POSITIVE_INFINITY,
      rate: -10,
      size: 99,
      lifetime: Number.NaN,
      lift: 99,
      spread: -4,
      turbulence: 99,
      opacity: -1,
    });
    expect(sanitized).toMatchObject({
      kind: 'none',
      seed: 0xffffffff,
      particleBudget: DEFAULT_EMITTER_SETTINGS.particleBudget,
      rate: 0,
      size: 2.5,
      lifetime: DEFAULT_EMITTER_SETTINGS.lifetime,
      lift: 3,
      spread: 0,
      turbulence: 2,
      opacity: 0,
    });

    const out: EmitterContinuousSettings = {
      rate: 0,
      size: 0,
      lifetime: 0,
      lift: 0,
      spread: 0,
      turbulence: 0,
      opacity: 0,
    };
    resolveEmitterRuntimeSettings(
      DEFAULT_BUBBLE_EMITTER_SETTINGS,
      { emitterRate: 500, emitterOpacity: 0.25 },
      out,
    );
    expect(out.rate).toBe(120);
    expect(out.opacity).toBe(0.25);
    expect(out.lifetime).toBe(DEFAULT_BUBBLE_EMITTER_SETTINGS.lifetime);
  });
});
