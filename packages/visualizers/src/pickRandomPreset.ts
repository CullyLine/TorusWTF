import { VISUALIZERS, type VisualizerId } from './registry';

const PRESET_IDS = Object.keys(VISUALIZERS) as VisualizerId[];

/** Picks one of the four 3D presets at random (e.g. when uploader chose "none"). */
export function pickRandomVisualizerPreset(): VisualizerId {
  return PRESET_IDS[Math.floor(Math.random() * PRESET_IDS.length)]!;
}
