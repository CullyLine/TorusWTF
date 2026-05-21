import type { ComponentType } from 'react';
import type { AnalyserHandle } from './audio';
import { TorusFieldScene } from './presets/TorusField';
import { ParticleStormScene } from './presets/ParticleStorm';
import { SpectralTunnelScene } from './presets/SpectralTunnel';
import { VolumetricWaveformScene } from './presets/VolumetricWaveform';
import { CosmicMandalaScene } from './presets/CosmicMandala';

export type VisualizerId =
  | 'torus_field'
  | 'particle_storm'
  | 'spectral_tunnel'
  | 'volumetric_waveform'
  | 'cosmic_mandala';

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
  cosmic_mandala: {
    id: 'cosmic_mandala',
    label: 'Cosmic Mandala',
    hint: 'Sacred-geometry rings in radial symmetry — brand-aligned calm power.',
    Scene: CosmicMandalaScene,
  },
};
