export type ClipStatus = 'pending' | 'processing' | 'ready' | 'failed';
export type ClipVisibility = 'public' | 'unlisted';
export type UserRole = 'user' | 'admin';
export type UserTier = 'free' | 'supporter';
export type VisualizerPreset =
  | 'torus_field'
  | 'particle_storm'
  | 'spectral_tunnel'
  | 'volumetric_waveform'
  | 'none';

export interface WaveformPalette {
  bass: string;
  mid: string;
  high: string;
}

export interface PeakBin {
  /** Mono RMS peak, -1..1 */
  peak: number;
  /** Low band energy 0..1 */
  low: number;
  /** Mid band energy 0..1 */
  mid: number;
  /** High band energy 0..1 */
  high: number;
}

export interface PeaksJson {
  version: 1;
  sampleRate: number;
  binMs: number;
  bins: PeakBin[];
}
