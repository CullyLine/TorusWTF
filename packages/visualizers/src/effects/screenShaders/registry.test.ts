import { describe, expect, it } from 'vitest';
import { CREATIVE_SCREEN_EFFECT_IDS } from '../screenEffects';
import {
  SCREEN_SHADER_MODULES,
  buildScreenFragmentShader,
  getScreenShaderModule,
} from './registry';
import {
  SCREEN_AUDIO_UNIFORM_KEYS,
  SCREEN_TIER_VALUE,
  SCREEN_UNIFORM_KEYS,
  createScreenUniformMap,
  writeScreenUniformFrame,
} from './uniforms';
import { DEFAULT_METRICS } from '../../metrics';

const TIERS = ['low', 'mid', 'high'] as const;

describe('SCREEN_SHADER_MODULES', () => {
  it('is complete for every creative screen effect id', () => {
    expect(CREATIVE_SCREEN_EFFECT_IDS).toHaveLength(10);
    for (const id of CREATIVE_SCREEN_EFFECT_IDS) {
      expect(SCREEN_SHADER_MODULES[id]).toBeDefined();
      expect(getScreenShaderModule(id).id).toBe(id);
      expect(getScreenShaderModule(id).source.length).toBeGreaterThan(0);
      expect(getScreenShaderModule(id).source.includes('void mainImage')).toBe(true);
      expect(getScreenShaderModule(id).source.includes(`${id}Style`)).toBe(true);
    }
    expect(Object.keys(SCREEN_SHADER_MODULES)).toHaveLength(CREATIVE_SCREEN_EFFECT_IDS.length);
  });

  it('builds tier-specific sources that only include the selected style body', () => {
    for (const id of CREATIVE_SCREEN_EFFECT_IDS) {
      for (const tier of TIERS) {
        const fragment = buildScreenFragmentShader(id, tier);
        const tierDefine =
          tier === 'low' ? 'TIER_LOW' : tier === 'mid' ? 'TIER_MID' : 'TIER_HIGH';
        expect(fragment.includes(`#define ${tierDefine}`)).toBe(true);
        expect(fragment.includes(`${id}Style`)).toBe(true);
        for (const other of CREATIVE_SCREEN_EFFECT_IDS) {
          if (other === id) continue;
          expect(fragment.includes(`${other}Style`)).toBe(false);
        }
      }
    }

    // Existing styles keep their compiled identity across tiers.
    const highMatrix = buildScreenFragmentShader('matrix', 'high');
    const lowPixel8 = buildScreenFragmentShader('pixel8', 'low');
    expect(highMatrix.includes('matrixStyle')).toBe(true);
    expect(highMatrix.includes('pixel8Style')).toBe(false);
    expect(highMatrix.includes('cartoonStyle')).toBe(false);
    expect(lowPixel8.includes('#define TIER_LOW')).toBe(true);
    expect(lowPixel8.includes('pixel8Style')).toBe(true);
    expect(lowPixel8.includes('matrixStyle')).toBe(false);
  });
});

describe('screen uniform frame contract', () => {
  it('exposes the shared audio/palette/depth/tier keys', () => {
    expect(SCREEN_AUDIO_UNIFORM_KEYS).toEqual(
      expect.arrayContaining([
        'audioBass',
        'audioMid',
        'audioHigh',
        'energy',
        'impact',
        'swell',
        'shimmer',
        'kick',
        'snare',
        'hat',
        'sectionLevel',
        'afterglow',
        'silence',
        'tension',
        'dropEvent',
        'release',
        'tenderness',
        'gather',
        'convergence',
      ]),
    );
    expect(SCREEN_UNIFORM_KEYS).toEqual(
      expect.arrayContaining([
        'mixAmount',
        'time',
        'resolution',
        'colorBass',
        'colorMid',
        'colorHigh',
        'sceneDepth',
        'depthTexel',
        'cameraNear',
        'cameraFar',
        'tier',
      ]),
    );
    expect(SCREEN_TIER_VALUE).toEqual({ low: 0, mid: 1, high: 2 });
  });

  it('updates existing uniforms in place without dropping keys', () => {
    const uniforms = createScreenUniformMap(0.5, 'mid', null, 0.2, 800, 384);
    expect(uniforms.size).toBe(SCREEN_UNIFORM_KEYS.length);

    writeScreenUniformFrame(uniforms, {
      time: 3,
      mixAmount: 0.75,
      palette: { bass: '#ff0000', mid: '#00ff00', high: '#0000ff' },
      metrics: { ...DEFAULT_METRICS, bass: 0.8, kick: 0.4, gather: 0.2 },
      cameraNear: 0.3,
      cameraFar: 500,
    });

    expect(uniforms.get('mixAmount')!.value).toBe(0.75);
    expect(uniforms.get('time')!.value).toBe(3);
    expect(uniforms.get('audioBass')!.value).toBe(0.8);
    expect(uniforms.get('kick')!.value).toBe(0.4);
    expect(uniforms.get('gather')!.value).toBe(0.2);
    expect(uniforms.get('cameraNear')!.value).toBe(0.3);
    expect(uniforms.get('cameraFar')!.value).toBe(500);
    expect(uniforms.get('tier')!.value).toBe(1);
    expect(uniforms.size).toBe(SCREEN_UNIFORM_KEYS.length);
  });

  it('bounds non-finite and max-gain metrics before they reach screen warps', () => {
    const uniforms = createScreenUniformMap(1, 'high', null, 0.1, 100, 384);
    writeScreenUniformFrame(uniforms, {
      time: 1,
      mixAmount: 1,
      palette: { bass: '#112233', mid: '#445566', high: '#778899' },
      metrics: {
        ...DEFAULT_METRICS,
        bass: 10,
        mid: -2,
        high: Number.NaN,
        energy: Number.POSITIVE_INFINITY,
        kick: 10,
        snare: 10,
        hat: 10,
        swell: 4,
      },
      cameraNear: 0.1,
      cameraFar: 100,
    });

    expect(uniforms.get('audioBass')!.value).toBe(2);
    expect(uniforms.get('audioMid')!.value).toBe(0);
    expect(uniforms.get('audioHigh')!.value).toBe(0);
    expect(uniforms.get('energy')!.value).toBe(0);
    expect(uniforms.get('kick')!.value).toBe(1.5);
    expect(uniforms.get('snare')!.value).toBe(1.5);
    expect(uniforms.get('hat')!.value).toBe(1.5);
    expect(uniforms.get('swell')!.value).toBe(1);
    for (const key of SCREEN_AUDIO_UNIFORM_KEYS) {
      expect(Number.isFinite(uniforms.get(key)!.value)).toBe(true);
      expect(uniforms.get(key)!.value).toBeGreaterThanOrEqual(0);
    }
  });
});
