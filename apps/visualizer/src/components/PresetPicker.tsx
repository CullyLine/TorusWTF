'use client';

import { VISUALIZERS, type VisualizerId } from '@torus/visualizers';

interface PresetPickerProps {
  active: VisualizerId;
  onChange: (id: VisualizerId) => void;
  onRandom: () => void;
}

const PRESET_IDS = Object.keys(VISUALIZERS) as VisualizerId[];

const PRESET_COLORS: Record<VisualizerId, string> = {
  anima: '#FBBF24',
  flow_field: '#38BDF8',
  torus_field: '#FF2D95',
  particle_storm: '#22D3CE',
  infinite_tunnel: '#F7E08C',
  volumetric_waveform: '#A78BFA',
  cosmic_mandala: '#E879F9',
  star_field: '#60A5FA',
  outrun_grid: '#FB7185',
  liquid_chrome: '#C4B5FD',
  liquid_blob: '#F472B6',
  mandelbrot_zoom: '#34D399',
};

export function PresetPicker({ active, onChange, onRandom }: PresetPickerProps) {
  return (
    <section className="rounded-xl border border-torus-border bg-torus-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-torus-fg-dim">Preset</h2>
        <button
          type="button"
          onClick={onRandom}
          className="text-xs text-torus-mid hover:underline"
        >
          Random
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {PRESET_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            title={VISUALIZERS[id].hint}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition ${
              active === id
                ? 'border-torus-mid/50 bg-torus-mid/10 text-torus-mid'
                : 'border-torus-border text-torus-fg-dim hover:border-torus-border-strong'
            }`}
          >
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-full"
              style={{ background: PRESET_COLORS[id] }}
              aria-hidden
            />
            <span className="block font-medium text-torus-fg">{VISUALIZERS[id].label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}




