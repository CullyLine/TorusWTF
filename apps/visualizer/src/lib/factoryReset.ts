import {
  DEFAULT_EMITTER_SETTINGS,
  DEFAULT_SCREEN_EFFECT_SETTINGS,
  type EmitterSettings,
  type ModRouting,
  type ScreenEffectSettings,
  type VisualizerId,
} from '@torus/visualizers';
import type { WaveformPalette } from '@torus/shared';
import { DEFAULT_PALETTE } from './palettes';
import {
  DEFAULT_BACKGROUND,
  DEFAULT_CONTROLS,
  DEFAULT_TITLE_OVERLAY,
  type BackgroundSettings,
  type TitleOverlay,
  type VisualizerControls,
} from './storage';
import type { TriggerMapping } from './triggerActions';

export interface FactoryLookState {
  preset: VisualizerId;
  palette: WaveformPalette;
  controls: VisualizerControls;
  background: BackgroundSettings;
  titleOverlay: TitleOverlay;
  screenEffect: ScreenEffectSettings;
  emitter: EmitterSettings;
  triggerMappings: TriggerMapping[];
  modMatrix: ModRouting[];
}

/** Fresh copies prevent a reset edit from mutating any exported defaults. */
export function createFactoryLookState(): FactoryLookState {
  return {
    preset: 'flow_field',
    palette: { ...DEFAULT_PALETTE },
    controls: { ...DEFAULT_CONTROLS },
    background: { ...DEFAULT_BACKGROUND },
    titleOverlay: { ...DEFAULT_TITLE_OVERLAY },
    screenEffect: { ...DEFAULT_SCREEN_EFFECT_SETTINGS },
    emitter: { ...DEFAULT_EMITTER_SETTINGS },
    triggerMappings: [],
    modMatrix: [],
  };
}

/**
 * Pure reset model used by tests and non-React callers. Unknown fields are
 * preserved by design: saved presets, audio/export preferences, licensing,
 * and watermark state are outside the factory visual look.
 */
export function resetToFactoryLook<T extends object>(
  state: T,
): Omit<T, keyof FactoryLookState> & FactoryLookState {
  return { ...state, ...createFactoryLookState() };
}
