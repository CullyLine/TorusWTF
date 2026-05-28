'use client';

import type { AnalyserHandle, CameraMode, VisualizerId } from '@torus/visualizers';
import type { WaveformPalette } from '@torus/shared';
import { BandSplitter } from '@/components/BandSplitter';
import { EditableNumber } from '@/components/EditableNumber';
import { BUILTIN_PALETTES } from '@/lib/palettes';
import type { SavedPreset, VisualizerControls } from '@/lib/storage';
import { loadSavedPresets, persistSavedPresets } from '@/lib/storage';

interface ControlPanelProps {
  controls: VisualizerControls;
  onChange: (patch: Partial<VisualizerControls>) => void;
  palette: WaveformPalette;
  onPaletteChange: (palette: WaveformPalette) => void;
  showBpm: boolean;
  onShowBpmChange: (show: boolean) => void;
  unlocked: boolean;
  onLoadSaved: (preset: SavedPreset) => void;
  onSavePreset: () => void;
  presetsVersion: number;
  onPresetsChange: () => void;
  analyser: AnalyserHandle | null;
  activePreset: VisualizerId;
}

const CAMERA_MODES: CameraMode[] = ['still', 'drift', 'orbit', 'dive', 'cinematic'];

const CINEMATIC_SPEED_MIN = 0.25;
const CINEMATIC_SPEED_MAX = 3;
const CINEMATIC_SPEED_STEP = 0.05;

type SliderKey = Exclude<keyof VisualizerControls, 'cameraMode'>;

export function ControlPanel({
  controls,
  onChange,
  palette,
  onPaletteChange,
  showBpm,
  onShowBpmChange,
  unlocked,
  onLoadSaved,
  onSavePreset,
  presetsVersion,
  onPresetsChange,
  analyser,
  activePreset,
}: ControlPanelProps) {
  type SliderDef = {
    key: SliderKey;
    label: string;
    min: number;
    max: number;
    step: number;
  };
  const allSliders: SliderDef[] = [
    { key: 'reactivity', label: 'Gain', min: 0.2, max: 12.5, step: 0.05 },
    { key: 'energy', label: 'Energy', min: 0, max: 2, step: 0.05 },
    { key: 'bassMix', label: 'Bass', min: 0, max: 10, step: 0.05 },
    { key: 'midMix', label: 'Mid', min: 0, max: 10, step: 0.05 },
    { key: 'highMix', label: 'High', min: 0, max: 10, step: 0.05 },
    { key: 'bassShake', label: 'Bass Shake', min: 0, max: 3, step: 0.05 },
    { key: 'bloomIntensity', label: 'Bloom', min: 0.3, max: 12.5, step: 0.05 },
    { key: 'speed', label: 'Speed', min: 0.3, max: 12.5, step: 0.05 },
    { key: 'smoothness', label: 'Smoothness', min: 0, max: 0.95, step: 0.01 },
    { key: 'scale', label: 'Scale', min: 0.2, max: 5, step: 0.05 },
    { key: 'anima', label: 'Anima', min: 0, max: 1, step: 0.01 },
    { key: 'aura', label: 'Aura', min: 0, max: 1, step: 0.01 },
    // Liquid-Blob-specific. Filtered out below when a different preset is active.
    { key: 'inflate', label: 'Inflate', min: 0, max: 1, step: 0.01 },
    { key: 'appendages', label: 'Appendages', min: 0, max: 10, step: 1 },
    { key: 'subSpheres', label: 'Sub-spheres', min: 0, max: 8, step: 1 },
  ];
  const blobOnly: Array<keyof VisualizerControls> = [
    'inflate',
    'appendages',
    'subSpheres',
  ];
  const sliders: SliderDef[] = allSliders.filter(
    (s) => !blobOnly.includes(s.key) || activePreset === 'liquid_blob',
  );

  const saved = unlocked ? loadSavedPresets() : [];
  void presetsVersion;

  return (
    <section className="rounded-xl border border-torus-border bg-torus-surface p-4">
      <h2 className="mb-3 text-sm font-medium text-torus-fg-dim">Controls</h2>

      <div className="space-y-3">
        {sliders.map(({ key, label, min, max, step }, idx) => {
          // Smoothness/Scale/BassShake/Anima/Aura/Inflate/Appendages were
          // added later, so older persisted controls may not have them.
          // Default per-slider.
          const fallback =
            key === 'scale'
              ? 1
              : key === 'anima'
                ? 0.5
                : key === 'aura'
                  ? 0.4
                  : key === 'inflate'
                    ? 0.5
                    : key === 'appendages'
                      ? 4
                      : key === 'subSpheres'
                        ? 6
                        : 0;
          const value = controls[key] ?? fallback;
          const outOfRange = value < min || value > max;
          const sliderValue = Math.max(min, Math.min(max, value));
          const sliderEl = (
            <div key={key} className="block text-xs text-torus-fg-dim">
              <div className="mb-1 flex justify-between">
                <span>{label}</span>
                <EditableNumber
                  value={value}
                  onCommit={(v) => onChange({ [key]: v })}
                  ariaLabel={label}
                  outOfRange={outOfRange}
                />
              </div>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={sliderValue}
                onChange={(e) => onChange({ [key]: Number(e.target.value) })}
                className="w-full accent-torus-mid"
              />
            </div>
          );
          // Insert the BandSplitter UI right after Gain (the first slider).
          if (idx === 0) {
            return (
              <div key="gain-and-bands" className="space-y-3">
                {sliderEl}
                <BandSplitter
                  analyser={analyser}
                  palette={palette}
                  bassMaxHz={controls.bassMaxHz ?? 250}
                  midMaxHz={controls.midMaxHz ?? 2000}
                  onChange={onChange}
                />
              </div>
            );
          }
          return sliderEl;
        })}

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

        {controls.cameraMode === 'cinematic'
          ? (() => {
              const v = controls.cinematicSpeed ?? 1;
              const clamped = Math.max(
                CINEMATIC_SPEED_MIN,
                Math.min(CINEMATIC_SPEED_MAX, v),
              );
              const outOfRange = v < CINEMATIC_SPEED_MIN || v > CINEMATIC_SPEED_MAX;
              return (
                <div className="block text-xs text-torus-fg-dim">
                  <div className="mb-1 flex justify-between">
                    <span>Cinematic speed</span>
                    <EditableNumber
                      value={v}
                      onCommit={(next) => onChange({ cinematicSpeed: next })}
                      ariaLabel="Cinematic speed"
                      outOfRange={outOfRange}
                    />
                  </div>
                  <input
                    type="range"
                    min={CINEMATIC_SPEED_MIN}
                    max={CINEMATIC_SPEED_MAX}
                    step={CINEMATIC_SPEED_STEP}
                    value={clamped}
                    onChange={(e) =>
                      onChange({ cinematicSpeed: Number(e.target.value) })
                    }
                    className="w-full accent-torus-mid"
                  />
                </div>
              );
            })()
          : null}

        <label className="flex items-center gap-2 text-xs text-torus-fg-dim">
          <input
            type="checkbox"
            checked={showBpm}
            onChange={(e) => onShowBpmChange(e.target.checked)}
            className="accent-torus-mid"
          />
          Show BPM in viewport
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
