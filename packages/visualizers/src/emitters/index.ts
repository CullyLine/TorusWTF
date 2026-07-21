export {
  EMITTER_KINDS,
  EMITTER_REGISTRY,
  EmitterLayer,
  getEmitterDefinition,
  isEmitterKind,
} from './registry';
export {
  BUBBLE_TIER_BUDGETS,
  BUBBLE_TIER_BURST_LIMITS,
  DEFAULT_BUBBLE_EMITTER_SETTINGS,
  DEFAULT_EMITTER_SETTINGS,
  EMITTER_CONTROL_KEYS,
  EMITTER_CONTROLS,
  EMITTER_CONTROLS_BY_KEY,
  resolveEmitterRuntimeSettings,
  resolveEmitterSettings,
  sanitizeEmitterSettings,
} from './settings';
export {
  MAX_BUBBLE_STEP_SECONDS,
  createBubblePool,
  emitBubbleBurst,
  emitBubbleParticles,
  resetBubblePool,
  stepBubblePool,
  type BubblePool,
  type BubblePoolConfig,
} from './bubbleSimulation';
export { BubbleEmitter } from './BubbleEmitter';
export type {
  EmitterContinuousSettings,
  EmitterControlDefinition,
  EmitterControlKey,
  EmitterDefinition,
  EmitterImpulseSource,
  EmitterKind,
  EmitterLayerProps,
  EmitterModulatedValues,
  EmitterModulationRef,
  EmitterPalette,
  EmitterRendererProps,
  EmitterSettingKey,
  EmitterSettings,
  ResolvedEmitterSettings,
} from './types';
