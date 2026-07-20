import { describe, expect, it } from 'vitest';
import { DEFAULT_EMITTER_SETTINGS, DEFAULT_SCREEN_EFFECT_SETTINGS } from '@torus/visualizers';
import { createFactoryLookState, resetToFactoryLook } from './factoryReset';
import {
  DEFAULT_BACKGROUND,
  DEFAULT_CONTROLS,
  DEFAULT_TITLE_OVERLAY,
} from './storage';
import { DEFAULT_PALETTE } from './palettes';

describe('factory visual reset', () => {
  it('restores the complete look and empties both routing systems', () => {
    const factory = createFactoryLookState();

    expect(factory).toMatchObject({
      preset: 'flow_field',
      palette: DEFAULT_PALETTE,
      controls: DEFAULT_CONTROLS,
      background: DEFAULT_BACKGROUND,
      titleOverlay: DEFAULT_TITLE_OVERLAY,
      screenEffect: DEFAULT_SCREEN_EFFECT_SETTINGS,
      emitter: DEFAULT_EMITTER_SETTINGS,
      triggerMappings: [],
      modMatrix: [],
    });
  });

  it('preserves saved content and non-look preferences', () => {
    const savedPresets = [{ id: 'saved-look' }];
    const watermark = { show: false, customImageDataUrl: 'data:image/png;base64,abc' };
    const reset = resetToFactoryLook({
      preset: 'anima',
      palette: { bass: '#000000', mid: '#111111', high: '#222222' },
      controls: { ...DEFAULT_CONTROLS, speed: 3 },
      background: { mode: 'aurora', intensity: 1 },
      titleOverlay: { ...DEFAULT_TITLE_OVERLAY, enabled: true, title: 'Keep out' },
      screenEffect: { id: 'matrix', mix: 0.8 },
      emitter: { ...DEFAULT_EMITTER_SETTINGS, kind: 'bubbles' },
      triggerMappings: [{ id: 'trigger' }],
      modMatrix: [{ id: 'mod' }],
      savedPresets,
      audioPreference: { volume: 0.42, sourceKind: 'file' },
      exportPreference: { resolution: '4k', fps: 60 },
      license: { unlocked: true },
      watermark,
    });

    expect(reset.preset).toBe('flow_field');
    expect(reset.screenEffect).toEqual(DEFAULT_SCREEN_EFFECT_SETTINGS);
    expect(reset.emitter).toEqual(DEFAULT_EMITTER_SETTINGS);
    expect(reset.triggerMappings).toEqual([]);
    expect(reset.modMatrix).toEqual([]);
    expect(reset.savedPresets).toBe(savedPresets);
    expect(reset.audioPreference).toEqual({ volume: 0.42, sourceKind: 'file' });
    expect(reset.exportPreference).toEqual({ resolution: '4k', fps: 60 });
    expect(reset.license).toEqual({ unlocked: true });
    expect(reset.watermark).toBe(watermark);
  });
});
