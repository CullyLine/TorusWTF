import type { ComponentType } from 'react';
import type { AnalyserHandle } from './audio.js';
import { TorusFieldScene } from './presets/TorusField.js';
import { ParticleStormScene } from './presets/ParticleStorm.js';
import { SpectralTunnelScene } from './presets/SpectralTunnel.js';
import { VolumetricWaveformScene } from './presets/VolumetricWaveform.js';

export type VisualizerId =
  | 'torus_field'
  | 'particle_storm'
  | 'spectral_tunnel'
  | 'volumetric_waveform';

export interface VisualizerSceneProps {
  analyser: AnalyserHandle | null;
  palette: { bass: string; mid: string; high: string };
  tier: 'high' | 'mid' | 'low';
}

export interface VisualizerDefinition {
  id: VisualizerId;
  label: string;
  hint: string;
  Scene: ComponentType<VisualizerSceneProps>;
}

/**
 * The single source of truth for available 3D presets.
 *
 * Adding a new preset is a one-file change for contributors:
 *   1. Drop a new component into `./presets/`
 *   2. Add an entry here
 *
 * See CONTRIBUTING.md.
 */
export const VISUALIZERS: Record<VisualizerId, VisualizerDefinition> = {
  torus_field: {
    id: 'torus_field',
    label: 'Torus Field',
    hint: 'Sacred-geometry energy flow — the brand signature.',
    Scene: TorusFieldScene,
  },
  particle_storm: {
    id: 'particle_storm',
    label: 'Particle Storm',
    hint: 'Frequency-driven swarm. Punchy energy for big drops.',
    Scene: ParticleStormScene,
  },
  spectral_tunnel: {
    id: 'spectral_tunnel',
    label: 'Spectral Tunnel',
    hint: 'Glide through a deforming tube. Melodic + ambient.',
    Scene: SpectralTunnelScene,
  },
  volumetric_waveform: {
    id: 'volumetric_waveform',
    label: 'Volumetric Waveform',
    hint: 'The waveform extruded into 3D — minimal, universal.',
    Scene: VolumetricWaveformScene,
  },
};
