import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTROLS, controlsFromSavedPreset, type SavedPreset } from './storage';

/** The fields every saved look has had since the first version. */
const LEGACY_SAVE: SavedPreset = {
  id: 'legacy',
  name: 'Old look',
  createdAt: '2025-01-01T00:00:00.000Z',
  presetId: 'flow_field',
  palette: { bass: '#ff0000', mid: '#00ff00', high: '#0000ff' },
  reactivity: 1.4,
  bassMix: 0.8,
  midMix: 1.2,
  highMix: 1,
  cameraMode: 'orbit',
  bloomIntensity: 0.5,
  speed: 2,
};

describe('controlsFromSavedPreset', () => {
  it('keeps the values the save recorded', () => {
    const controls = controlsFromSavedPreset(LEGACY_SAVE);
    expect(controls.reactivity).toBe(1.4);
    expect(controls.bassMix).toBe(0.8);
    expect(controls.cameraMode).toBe('orbit');
    expect(controls.bloomIntensity).toBe(0.5);
    expect(controls.speed).toBe(2);
  });

  it('fills controls a legacy save predates with their pre-feature values', () => {
    const controls = controlsFromSavedPreset(LEGACY_SAVE);
    // These differ from today's defaults on purpose: an old save must keep
    // looking the way it did before the control existed.
    expect(controls.smoothness).toBe(0);
    expect(controls.scale).toBe(1);
    expect(controls.bassMaxHz).toBe(250);
    expect(controls.aura).toBe(0.4);
    expect(controls.autoGain).toBe(true);
    expect(controls.highlightProtection).toBe(true);
  });

  it('prefers a recorded value over the fallback, including zero and false', () => {
    const controls = controlsFromSavedPreset({
      ...LEGACY_SAVE,
      aura: 0,
      autoGain: false,
      scale: 0.55,
    });
    expect(controls.aura).toBe(0);
    expect(controls.autoGain).toBe(false);
    expect(controls.scale).toBe(0.55);
  });

  it('returns a value for every control the app knows about', () => {
    const controls = controlsFromSavedPreset(LEGACY_SAVE);
    for (const key of Object.keys(DEFAULT_CONTROLS)) {
      expect(controls[key as keyof typeof controls], key).toBeDefined();
    }
  });
});
