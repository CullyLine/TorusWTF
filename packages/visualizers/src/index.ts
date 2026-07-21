export { VisualizerCanvas, type VisualizerCanvasProps, type RootState } from './VisualizerCanvas';
export { useAudioAnalyser, useStreamAnalyser } from './audio';
export type { AnalyserHandle } from './audio';
export { detectTier, type DeviceTier } from './tier';
export {
  VISUALIZERS,
  FULLSCREEN_SHADER_PRESETS,
  type VisualizerId,
  type VisualizerDefinition,
  type PresetControlDefaults,
} from './registry';
export {
  BackgroundLayer,
  BACKGROUND_MODES,
  type BackgroundMode,
  type BackgroundLayerProps,
} from './BackgroundLayer';
export { pickRandomVisualizerPreset } from './pickRandomPreset';
export {
  CONTROL_SCHEMA,
  CONTROL_DEFS_BY_KEY,
  TOGGLE_CONTROL_SCHEMA,
  TOGGLE_CONTROL_DEFS_BY_KEY,
  controlsForGroup,
  type ControlDef,
  type ControlGroup,
  type ControlKey,
  type ToggleControlDef,
  type ToggleControlKey,
} from './controlSchema';
export {
  SCREEN_EFFECT_IDS,
  SCREEN_EFFECT_REGISTRY,
  SCREEN_EFFECT_OPTIONS,
  CREATIVE_SCREEN_EFFECT_IDS,
  DEFAULT_SCREEN_EFFECT_SETTINGS,
  isScreenEffectId,
  clampScreenEffectMix,
  sanitizeScreenEffectSettings,
  pickRandomScreenEffect,
  type ScreenEffectId,
  type ScreenEffectDefinition,
  type ScreenEffectSettings,
} from './effects/screenEffects';
export * from './emitters';
export { consumeCinematicCut, createImpulses, type VisualImpulses } from './impulse';
export {
  MOD_SOURCES,
  MOD_SOURCES_BY_KEY,
  MOD_CURVES,
  MOD_GLOBAL_TARGETS,
  modTargetsForPreset,
  shapeModValue,
  isValidModRouting,
  sanitizeModRoutings,
  type ModSourceKey,
  type ModSourceDef,
  type ModCurve,
  type ModRouting,
  type ModulatedValues,
} from './modulation';
export { DEFAULT_METRICS } from './metrics';
export type { AudioMetrics, MetricsScales } from './metrics';
export type { CameraMode } from './SceneRig';
export {
  CINEMATIC_SHOTS,
  advanceToNextCinematicShot,
  createCinematicState,
  type CinematicState,
  type Shot,
} from './dsp/cinematic';
export {
  createCreature,
  NEUTRAL_PERSONALITY,
  type Creature,
  type CreaturePersonality,
} from './dsp/creature';
