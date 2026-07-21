import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUBBLE_EMITTER_SETTINGS,
  DEFAULT_EMITTER_SETTINGS,
  DEFAULT_SCREEN_EFFECT_SETTINGS,
} from '@torus/visualizers';
import { DEFAULT_BACKGROUND, DEFAULT_CONTROLS } from './storage';
import {
  buildShowFile,
  parseShowFile,
  serializeShowFile,
  type ShowFileState,
} from './showFile';

const baseState: ShowFileState = {
  preset: 'flow_field',
  palette: { bass: '#112233', mid: '#445566', high: '#778899' },
  controls: { ...DEFAULT_CONTROLS, reactivity: 1.5, bloomIntensity: 0.4 },
  background: { mode: 'nebula', intensity: 0.8 },
  screenEffect: { id: 'cartoon', mix: 0.65 },
  emitter: { ...DEFAULT_BUBBLE_EMITTER_SETTINGS, rate: 24 },
  titleOverlay: {
    enabled: true,
    title: 'Demo',
    subtitle: 'Track',
    position: 'bottom-center',
    textColor: '#ffffff',
    bgOpacity: 0.4,
  },
  triggerMappings: [
    {
      id: 'map-1',
      enabled: true,
      source: 'drop',
      action: 'hueKick',
      midiNote: null,
    },
  ],
  modMatrix: [],
  savedPresets: [
    {
      id: 'sp-1',
      name: 'My look',
      createdAt: '2026-01-01T00:00:00.000Z',
      presetId: 'flow_field',
      palette: { bass: '#111111', mid: '#222222', high: '#333333' },
      reactivity: 1,
      bassMix: 1,
      midMix: 1,
      highMix: 1,
      cameraMode: 'flow',
      bloomIntensity: 0.9,
      speed: 1,
      screenEffect: { id: 'matrix', mix: 0.3 },
      emitter: { ...DEFAULT_BUBBLE_EMITTER_SETTINGS, rate: 18 },
    },
  ],
};

describe('showFile', () => {
  it('round-trips build → serialize → parse', () => {
    const show = buildShowFile(baseState);
    const text = serializeShowFile(show);
    const result = parseShowFile(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.show.kind).toBe('torus-show');
    expect(result.show.version).toBe(1);
    expect(result.show.preset).toBe('flow_field');
    expect(result.show.palette).toEqual(baseState.palette);
    expect(result.show.controls.reactivity).toBe(1.5);
    expect(result.show.controls.bloomIntensity).toBe(0.4);
    expect(result.show.background).toEqual(baseState.background);
    expect(result.show.screenEffect).toEqual(baseState.screenEffect);
    expect(result.show.emitter).toEqual(baseState.emitter);
    expect(result.show.titleOverlay.title).toBe('Demo');
    expect(result.show.triggerMappings).toHaveLength(1);
    expect(result.show.savedPresets).toHaveLength(1);
    expect(result.show.savedPresets[0]?.screenEffect).toEqual({ id: 'matrix', mix: 0.3 });
    expect(result.show.savedPresets[0]?.emitter?.kind).toBe('bubbles');
  });

  it('rejects non-JSON text', () => {
    const result = parseShowFile('not json {{{');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/json/i);
  });

  it('rejects JSON that is not an object', () => {
    const result = parseShowFile('[1,2,3]');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/object/i);
  });

  it('rejects wrong kind', () => {
    const result = parseShowFile(
      JSON.stringify({ kind: 'something-else', version: 1 }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/kind/i);
  });

  it('rejects version 2 with a newer-version message', () => {
    const result = parseShowFile(
      JSON.stringify({
        kind: 'torus-show',
        version: 2,
        preset: 'flow_field',
        palette: baseState.palette,
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/newer version/i);
  });

  it('migrates spectral_tunnel to infinite_tunnel', () => {
    const show = buildShowFile(baseState);
    const result = parseShowFile(
      JSON.stringify({ ...show, preset: 'spectral_tunnel' }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.show.preset).toBe('infinite_tunnel');
  });

  it('rejects bad palette hex', () => {
    const show = buildShowFile(baseState);
    const bad = {
      ...show,
      palette: { bass: 'red', mid: '#445566', high: '#778899' },
    };
    const result = parseShowFile(JSON.stringify(bad));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/palette|color|bass/i);
  });

  it('rejects unknown preset id', () => {
    const show = buildShowFile(baseState);
    const result = parseShowFile(
      JSON.stringify({ ...show, preset: 'not_a_real_preset' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/unknown preset/i);
    expect(result.error).toMatch(/not_a_real_preset/);
  });

  it('merges missing controls from defaults and drops bad numeric values', () => {
    const show = buildShowFile(baseState);
    const result = parseShowFile(
      JSON.stringify({
        ...show,
        controls: { reactivity: 'loud', bloomIntensity: 0.2 },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.show.controls.reactivity).toBe(DEFAULT_CONTROLS.reactivity);
    expect(result.show.controls.bloomIntensity).toBe(0.2);
    expect(result.show.controls.bassMix).toBe(DEFAULT_CONTROLS.bassMix);
    expect(result.show.controls.cameraMode).toBe(DEFAULT_CONTROLS.cameraMode);
  });

  it('filters invalid triggerMappings and defaults absent to []', () => {
    const show = buildShowFile(baseState);
    const withJunk = parseShowFile(
      JSON.stringify({
        ...show,
        triggerMappings: [
          {
            id: 'ok',
            enabled: true,
            source: 'beat',
            action: 'flash',
          },
          { id: 1, enabled: true, source: 'beat', action: 'flash' },
          { id: 'bad-source', enabled: true, source: 'nope', action: 'flash' },
          'not-an-object',
        ],
      }),
    );
    expect(withJunk.ok).toBe(true);
    if (!withJunk.ok) return;
    expect(withJunk.show.triggerMappings).toHaveLength(1);
    expect(withJunk.show.triggerMappings[0]?.id).toBe('ok');

    const { triggerMappings: _omit, ...without } = show;
    const absent = parseShowFile(JSON.stringify(without));
    expect(absent.ok).toBe(true);
    if (!absent.ok) return;
    expect(absent.show.triggerMappings).toEqual([]);
  });

  it('falls back bad background mode and clamps intensity', () => {
    const show = buildShowFile(baseState);
    const result = parseShowFile(
      JSON.stringify({
        ...show,
        background: { mode: 'disco', intensity: 4 },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.show.background.mode).toBe(DEFAULT_BACKGROUND.mode);
    expect(result.show.background.intensity).toBe(1);
  });

  it('sanitizes effects and defaults old v1 shows to disabled layers', () => {
    const show = buildShowFile(baseState);
    const invalid = parseShowFile(
      JSON.stringify({
        ...show,
        screenEffect: { id: 'unknown', mix: 4 },
        emitter: { kind: 'unknown', rate: -20, opacity: 5 },
      }),
    );
    expect(invalid.ok).toBe(true);
    if (!invalid.ok) return;
    expect(invalid.show.screenEffect).toEqual(DEFAULT_SCREEN_EFFECT_SETTINGS);
    expect(invalid.show.emitter.kind).toBe('none');
    expect(invalid.show.emitter.rate).toBe(0);
    expect(invalid.show.emitter.opacity).toBe(1);

    const { screenEffect: _screenEffect, emitter: _emitter, ...legacy } = show;
    const oldV1 = parseShowFile(JSON.stringify(legacy));
    expect(oldV1.ok).toBe(true);
    if (!oldV1.ok) return;
    expect(oldV1.show.screenEffect).toEqual(DEFAULT_SCREEN_EFFECT_SETTINGS);
    expect(oldV1.show.emitter).toEqual(DEFAULT_EMITTER_SETTINGS);
  });

  it('sanitizes nested effect settings without breaking legacy saved presets', () => {
    const show = buildShowFile(baseState);
    const saved = show.savedPresets[0]!;
    const { screenEffect: _screenEffect, emitter: _emitter, ...legacySaved } = saved;
    const result = parseShowFile(
      JSON.stringify({
        ...show,
        savedPresets: [
          {
            ...saved,
            screenEffect: { id: 'invalid', mix: Number.POSITIVE_INFINITY },
            emitter: { kind: 'invalid', particleBudget: -5, opacity: Number.NaN },
          },
          legacySaved,
        ],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.show.savedPresets[0]?.screenEffect).toEqual(DEFAULT_SCREEN_EFFECT_SETTINGS);
    expect(result.show.savedPresets[0]?.emitter).toEqual(
      expect.objectContaining({ kind: 'none', particleBudget: 1 }),
    );
    expect(result.show.savedPresets[1]?.screenEffect).toBeUndefined();
    expect(result.show.savedPresets[1]?.emitter).toBeUndefined();
  });
});
