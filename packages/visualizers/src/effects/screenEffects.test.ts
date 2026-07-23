import { describe, expect, it } from 'vitest';
import { EffectAttribute } from 'postprocessing';
import { CONTROL_DEFS_BY_KEY, TOGGLE_CONTROL_DEFS_BY_KEY } from '../controlSchema';
import { MOD_GLOBAL_TARGETS, isValidModRouting } from '../modulation';
import { DEFAULT_METRICS } from '../metrics';
import { ScreenStyleEffect } from './ScreenStyleEffect';
import {
  CREATIVE_SCREEN_EFFECT_IDS,
  DEFAULT_SCREEN_EFFECT_SETTINGS,
  SCREEN_EFFECT_IDS,
  SCREEN_EFFECT_OPTIONS,
  SCREEN_EFFECT_REGISTRY,
  clampScreenEffectMix,
  isCreativeScreenEffectId,
  isScreenEffectId,
  pickRandomScreenEffect,
  sanitizeScreenEffectSettings,
  type ScreenEffectId,
} from './screenEffects';
import {
  SCREEN_SHADER_MODULES,
  buildScreenFragmentShader,
  getScreenShaderModule,
} from './screenShaders/registry';
import { SCREEN_UNIFORM_KEYS } from './screenShaders/uniforms';

const DEPTH_SCREEN_EFFECT_IDS = ['matrix', 'cartoon', 'bubble_melt', 'firefly_hug'] as const;

describe('screen effect registry', () => {
  it('has one complete definition for every stable ID', () => {
    expect(SCREEN_EFFECT_OPTIONS.map((effect) => effect.id)).toEqual([...SCREEN_EFFECT_IDS]);
    expect(CREATIVE_SCREEN_EFFECT_IDS).toHaveLength(10);
    expect(SCREEN_EFFECT_IDS).toHaveLength(CREATIVE_SCREEN_EFFECT_IDS.length + 1);
    for (const id of SCREEN_EFFECT_IDS) {
      expect(SCREEN_EFFECT_REGISTRY[id].label.length).toBeGreaterThan(0);
      expect(SCREEN_EFFECT_REGISTRY[id].description.length).toBeGreaterThan(0);
      expect(SCREEN_EFFECT_REGISTRY[id].defaultMix).toBeGreaterThanOrEqual(0);
      expect(SCREEN_EFFECT_REGISTRY[id].defaultMix).toBeLessThanOrEqual(1);
      expect(typeof SCREEN_EFFECT_REGISTRY[id].usesDepth).toBe('boolean');
      expect(isScreenEffectId(id)).toBe(true);
    }
    expect(isScreenEffectId('unknown')).toBe(false);
    expect(DEFAULT_SCREEN_EFFECT_SETTINGS).toEqual({ id: 'none', mix: 1 });
  });

  it('marks depth use only for styles that sample scene depth', () => {
    for (const id of SCREEN_EFFECT_IDS) {
      const expected = (DEPTH_SCREEN_EFFECT_IDS as readonly string[]).includes(id);
      expect(SCREEN_EFFECT_REGISTRY[id].usesDepth).toBe(expected);
    }
  });

  it('clamps wet/dry values and sanitizes every registered ID', () => {
    expect(clampScreenEffectMix(-1)).toBe(0);
    expect(clampScreenEffectMix(0.4)).toBe(0.4);
    expect(clampScreenEffectMix(2)).toBe(1);
    expect(clampScreenEffectMix(Number.NaN)).toBe(0);
    expect(sanitizeScreenEffectSettings({ id: 'unknown', mix: 'wet' })).toEqual(
      DEFAULT_SCREEN_EFFECT_SETTINGS,
    );
    for (const id of SCREEN_EFFECT_IDS) {
      expect(sanitizeScreenEffectSettings({ id, mix: 2 })).toEqual({ id, mix: 1 });
      expect(sanitizeScreenEffectSettings({ id, mix: -0.5 })).toEqual({ id, mix: 0 });
      expect(sanitizeScreenEffectSettings({ id })).toEqual({
        id,
        mix: DEFAULT_SCREEN_EFFECT_SETTINGS.mix,
      });
    }
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

  it('maps deterministic random boundaries from registry order', () => {
    const first = CREATIVE_SCREEN_EFFECT_IDS[0]!;
    const last = CREATIVE_SCREEN_EFFECT_IDS[CREATIVE_SCREEN_EFFECT_IDS.length - 1]!;
    expect(pickRandomScreenEffect('none', () => 0)).toBe(first);
    expect(pickRandomScreenEffect('none', () => 1)).toBe(last);

    const withoutFirst = CREATIVE_SCREEN_EFFECT_IDS.filter((id) => id !== first);
    expect(pickRandomScreenEffect(first, () => 0)).toBe(withoutFirst[0]);
    expect(pickRandomScreenEffect(first, () => 1)).toBe(withoutFirst[withoutFirst.length - 1]);

    const withoutLast = CREATIVE_SCREEN_EFFECT_IDS.filter((id) => id !== last);
    expect(pickRandomScreenEffect(last, () => 0)).toBe(withoutLast[0]);
    expect(pickRandomScreenEffect(last, () => 1)).toBe(withoutLast[withoutLast.length - 1]);
  });
});

describe('screen shader modules', () => {
  it('registers exactly one module per creative style with the shared uniform contract', () => {
    expect(Object.keys(SCREEN_SHADER_MODULES).sort()).toEqual(
      [...CREATIVE_SCREEN_EFFECT_IDS].sort(),
    );
    expect(Object.keys(SCREEN_SHADER_MODULES)).toHaveLength(10);
    for (const id of CREATIVE_SCREEN_EFFECT_IDS) {
      expect(isCreativeScreenEffectId(id)).toBe(true);
      const module = getScreenShaderModule(id);
      expect(module.id).toBe(id);
      expect(module.source.includes('void mainImage')).toBe(true);
      expect(module.source.includes('mixAmount')).toBe(true);
      expect(module.source.includes('wet <= 0.001')).toBe(true);
      expect(module.source.includes('inputColor.a')).toBe(true);
      expect(module.source.includes(`${id}Style`)).toBe(true);

      const fragment = buildScreenFragmentShader(id, 'mid');
      expect(fragment.includes('#define TIER_MID')).toBe(true);
      for (const key of SCREEN_UNIFORM_KEYS) {
        expect(fragment.includes(key)).toBe(true);
      }
      // Only the selected style body is compiled — sibling style entry points stay out.
      for (const other of CREATIVE_SCREEN_EFFECT_IDS) {
        if (other === id) continue;
        expect(fragment.includes(`${other}Style`)).toBe(false);
      }
    }
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

  it('constructs one compiled module per style with clamped mix and no DEPTH attribute', () => {
    for (const id of CREATIVE_SCREEN_EFFECT_IDS) {
      const effect = new ScreenStyleEffect(id, 2, 'low');
      expect(effect.style).toBe(id);
      expect(effect.tier).toBe('low');
      expect(effect.mix).toBe(1);

      effect.mix = -1;
      expect(effect.mix).toBe(0);

      effect.updateFrame({
        time: 1.25,
        palette: { bass: '#112233', mid: '#445566', high: '#778899' },
        metrics: DEFAULT_METRICS,
        cameraNear: 0.1,
        cameraFar: 100,
      });

      // Depth comes from SceneRig's fixed-size prepass. Asking postprocessing
      // for stable depth here regresses to an invalid multisample depth blit.
      expect(effect.getAttributes() & EffectAttribute.DEPTH).toBe(0);
      expect(effect.getAttributes() & EffectAttribute.CONVOLUTION).toBe(
        EffectAttribute.CONVOLUTION,
      );
      effect.dispose();
    }
  });

  it('treats wet zero as a bypass-safe mix value', () => {
    const effect = new ScreenStyleEffect('matrix', 0);
    expect(effect.mix).toBe(0);
    effect.mix = 0.001;
    expect(effect.mix).toBe(0.001);
    effect.dispose();
  });
});
