import { describe, expect, it } from 'vitest';
import { EffectAttribute } from 'postprocessing';
import { CONTROL_DEFS_BY_KEY, TOGGLE_CONTROL_DEFS_BY_KEY } from '../controlSchema';
import { MOD_GLOBAL_TARGETS, isValidModRouting } from '../modulation';
import { ScreenStyleEffect } from './ScreenStyleEffect';
import {
  CREATIVE_SCREEN_EFFECT_IDS,
  DEFAULT_SCREEN_EFFECT_SETTINGS,
  SCREEN_EFFECT_IDS,
  SCREEN_EFFECT_OPTIONS,
  SCREEN_EFFECT_REGISTRY,
  clampScreenEffectMix,
  isScreenEffectId,
  pickRandomScreenEffect,
  sanitizeScreenEffectSettings,
  type ScreenEffectId,
} from './screenEffects';

describe('screen effect registry', () => {
  it('has one complete definition for every stable ID', () => {
    expect(SCREEN_EFFECT_OPTIONS.map((effect) => effect.id)).toEqual(SCREEN_EFFECT_IDS);
    for (const id of SCREEN_EFFECT_IDS) {
      expect(SCREEN_EFFECT_REGISTRY[id].label.length).toBeGreaterThan(0);
      expect(SCREEN_EFFECT_REGISTRY[id].defaultMix).toBeGreaterThanOrEqual(0);
      expect(SCREEN_EFFECT_REGISTRY[id].defaultMix).toBeLessThanOrEqual(1);
      expect(isScreenEffectId(id)).toBe(true);
    }
    expect(isScreenEffectId('unknown')).toBe(false);
    expect(DEFAULT_SCREEN_EFFECT_SETTINGS).toEqual({ id: 'none', mix: 1 });
  });

  it('clamps wet/dry values to the supported range', () => {
    expect(clampScreenEffectMix(-1)).toBe(0);
    expect(clampScreenEffectMix(0.4)).toBe(0.4);
    expect(clampScreenEffectMix(2)).toBe(1);
    expect(clampScreenEffectMix(Number.NaN)).toBe(0);
    expect(sanitizeScreenEffectSettings({ id: 'cartoon', mix: 2 })).toEqual({
      id: 'cartoon',
      mix: 1,
    });
    expect(sanitizeScreenEffectSettings({ id: 'unknown', mix: 'wet' })).toEqual(
      DEFAULT_SCREEN_EFFECT_SETTINGS,
    );
  });
});

describe('pickRandomScreenEffect', () => {
  it('never returns none or the current creative style', () => {
    for (const current of SCREEN_EFFECT_IDS) {
      for (const roll of [0, 0.25, 0.5, 0.75, 0.999999]) {
        const picked = pickRandomScreenEffect(current, () => roll);
        expect(CREATIVE_SCREEN_EFFECT_IDS).toContain(picked);
        expect(picked).not.toBe('none');
        if (current !== 'none') expect(picked).not.toBe(current);
      }
    }
  });

  it('maps deterministic random boundaries to stable candidates', () => {
    expect(pickRandomScreenEffect('none', () => 0)).toBe('matrix');
    expect(pickRandomScreenEffect('none', () => 1)).toBe('cartoon');
    expect(pickRandomScreenEffect('matrix', () => 0)).toBe('pixel8');
    expect(pickRandomScreenEffect('cartoon', () => 1)).toBe('pixel8');
  });
});

describe('screen effect controls', () => {
  it('makes shader mix modulatable while keeping highlight protection static', () => {
    expect(CONTROL_DEFS_BY_KEY.shaderMix).toMatchObject({
      min: 0,
      max: 1,
      fallback: 1,
    });
    expect(MOD_GLOBAL_TARGETS).toContain('shaderMix');
    expect(MOD_GLOBAL_TARGETS).toEqual(
      expect.arrayContaining([
        'cinematicSpeed',
        'emitterRate',
        'emitterSize',
        'emitterLifetime',
        'emitterLift',
        'emitterSpread',
        'emitterTurbulence',
        'emitterOpacity',
      ]),
    );
    expect(TOGGLE_CONTROL_DEFS_BY_KEY.highlightProtection.fallback).toBe(true);
    expect(MOD_GLOBAL_TARGETS as readonly (ScreenEffectId | string)[]).not.toContain(
      'highlightProtection',
    );
    for (const target of ['cinematicSpeed', 'emitterRate', 'emitterOpacity'] as const) {
      expect(
        isValidModRouting({
          id: `route-${target}`,
          enabled: true,
          source: 'kick',
          target,
          amount: 0.5,
          curve: 'linear',
          glide: 0.2,
        }),
      ).toBe(true);
    }
  });

  it('applies the same wet/dry bounds to the composer effect', () => {
    const effect = new ScreenStyleEffect('matrix', 2);
    expect(effect.style).toBe('matrix');
    expect(effect.mix).toBe(1);

    effect.style = 'cartoon';
    effect.mix = -1;
    expect(effect.style).toBe('cartoon');
    expect(effect.mix).toBe(0);
    // Depth comes from SceneRig's fixed-size prepass. Asking postprocessing
    // for stable depth here regresses to an invalid multisample depth blit.
    expect(effect.getAttributes() & EffectAttribute.DEPTH).toBe(0);
    expect(effect.getAttributes() & EffectAttribute.CONVOLUTION).toBe(
      EffectAttribute.CONVOLUTION,
    );
    effect.dispose();
  });
});
