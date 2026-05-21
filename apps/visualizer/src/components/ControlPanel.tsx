'use client';

import type { CameraMode } from '@torus/visualizers';
import type { WaveformPalette } from '@torus/shared';
import { BUILTIN_PALETTES } from '@/lib/palettes';
import type { SavedPreset, VisualizerControls } from '@/lib/storage';
import { loadSavedPresets, persistSavedPresets } from '@/lib/storage';

interface ControlPanelProps {
  controls: VisualizerControls;
  onChange: (patch: Partial<VisualizerControls>) => void;
  palette: WaveformPalette;
  onPaletteChange: (palette: WaveformPalette) => void;
  unlocked: boolean;
  onLoadSaved: (preset: SavedPreset) => void;
  onSavePreset: () => void;
  presetsVersion: number;
  onPresetsChange: () => void;
}

const CAMERA_MODES: CameraMode[] = ['still', 'drift', 'orbit', 'dive'];

type SliderKey = Exclude<keyof VisualizerControls, 'cameraMode'>;

export function ControlPanel({
  controls,
  onChange,
  palette,
  onPaletteChange,
  unlocked,
  onLoadSaved,
  onSavePreset,
  presetsVersion,
  onPresetsChange,
}: ControlPanelProps) {
  const sliders: Array<{
    key: SliderKey;
    label: string;
    min: number;
    max: number;
    step: number;
  }> = [
    { key: 'reactivity', label: 'Reactivity', min: 0.2, max: 2.5, step: 0.05 },
    { key: 'bassMix', label: 'Bass', min: 0, max: 2, step: 0.05 },
    { key: 'midMix', label: 'Mid', min: 0, max: 2, step: 0.05 },
    { key: 'highMix', label: 'High', min: 0, max: 2, step: 0.05 },
    { key: 'bloomIntensity', label: 'Bloom', min: 0.3, max: 2.5, step: 0.05 },
    { key: 'speed', label: 'Speed', min: 0.3, max: 2.5, step: 0.05 },
  ];

  const saved = unlocked ? loadSavedPresets() : [];
  void presetsVersion;

  return (
    <section className="rounded-xl border border-torus-border bg-torus-surface p-4">
      <h2 className="mb-3 text-sm font-medium text-torus-fg-dim">Controls</h2>

      <div className="space-y-3">
        {sliders.map(({ key, label, min, max, step }) => (
          <label key={key} className="block text-xs text-torus-fg-dim">
            <div className="mb-1 flex justify-between">
              <span>{label}</span>
              <span>{controls[key].toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={controls[key]}
              onChange={(e) => onChange({ [key]: Number(e.target.value) })}
              className="w-full accent-torus-mid"
            />
          </label>
        ))}

        <label className="block text-xs text-torus-fg-dim">
          Camera motion
          <select
            value={controls.cameraMode}
            onChange={(e) => onChange({ cameraMode: e.target.value as CameraMode })}
            className="mt-1 w-full rounded-lg border border-torus-border bg-torus-bg px-2 py-1.5 text-sm text-torus-fg"
          >
            {CAMERA_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 border-t border-torus-border pt-4">
        <h3 className="mb-2 text-xs font-medium text-torus-fg-dim">Palette</h3>
        <div className="mb-2 flex flex-wrap gap-2">
          {BUILTIN_PALETTES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPaletteChange(p.palette)}
              className="rounded-full border border-torus-border px-2 py-1 text-[10px] text-torus-fg-dim hover:border-torus-mid/40"
            >
              {p.label}
            </button>
          ))}
        </div>

        {unlocked ? (
          <div className="grid grid-cols-3 gap-2">
            {(['bass', 'mid', 'high'] as const).map((band) => (
              <label key={band} className="text-[10px] text-torus-fg-faint">
                {band}
                <input
                  type="color"
                  value={palette[band]}
                  onChange={(e) => onPaletteChange({ ...palette, [band]: e.target.value })}
                  className="mt-1 h-8 w-full cursor-pointer rounded border border-torus-border bg-transparent"
                />
              </label>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-torus-fg-faint">Custom colors unlock with the full version.</p>
        )}
      </div>

      {unlocked ? (
        <div className="mt-4 border-t border-torus-border pt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-medium text-torus-fg-dim">Saved presets</h3>
            <button
              type="button"
              onClick={onSavePreset}
              className="text-[10px] text-torus-mid hover:underline"
            >
              Save current
            </button>
          </div>
          {saved.length === 0 ? (
            <p className="text-[10px] text-torus-fg-faint">No saved presets yet.</p>
          ) : (
            <ul className="space-y-1">
              {saved.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onLoadSaved(p)}
                    className="truncate text-left text-xs text-torus-fg hover:text-torus-mid"
                  >
                    {p.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      persistSavedPresets(saved.filter((s) => s.id !== p.id));
                      onPresetsChange();
                    }}
                    className="text-[10px] text-torus-fg-faint hover:text-torus-bass"
                  >
                    delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
