export { VisualizerCanvas, type RootState } from './VisualizerCanvas';
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
  controlsForGroup,
  type ControlDef,
  type ControlGroup,
  type ControlKey,
} from './controlSchema';
export { createImpulses, type VisualImpulses } from './impulse';
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
  createCreature,
  NEUTRAL_PERSONALITY,
  type Creature,
  type CreaturePersonality,
} from './dsp/creature';
