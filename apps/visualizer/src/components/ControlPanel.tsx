'use client';

import { useRef } from 'react';
import {
  BACKGROUND_MODES,
  VISUALIZERS,
  CONTROL_DEFS_BY_KEY,
  controlsForGroup,
  type AnalyserHandle,
  type BackgroundMode,
  type CameraMode,
  type ControlDef,
  type ControlKey,
  type VisualizerId,
} from '@torus/visualizers';
import type { WaveformPalette } from '@torus/shared';
import { BandSplitter } from '@/components/BandSplitter';
import { EditableNumber } from '@/components/EditableNumber';
import { BUILTIN_PALETTES } from '@/lib/palettes';
import type { BackgroundSettings, SavedPreset, VisualizerControls } from '@/lib/storage';
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
  onPickPaletteImage: (file: File) => void;
  background: BackgroundSettings;
  onBackgroundChange: (patch: Partial<BackgroundSettings>) => void;
}

const CAMERA_MODES: CameraMode[] = ['still', 'drift', 'orbit', 'dive', 'cinematic', 'flow'];

const CAMERA_LABELS: Record<CameraMode, string> = {
  still: 'Still',
  drift: 'Drift — slow float',
  orbit: 'Orbit — circle the scene',
  dive: 'Dive — push forward',
  cinematic: 'Cinematic — auto-directed',
  flow: 'Flow — ride the current',
};

const BACKGROUND_LABELS: Record<BackgroundMode, string> = {
  none: 'None',
  nebula: 'Nebula',
  starfield: 'Star field',
  aurora: 'Aurora',
  glow: 'Glow',
};

// Presets that still paint their own backdrop shader — the shared sky
// composites additively instead of replacing the scene.
const FULLSCREEN_PRESETS: ReadonlySet<VisualizerId> = new Set<VisualizerId>([
  'liquid_blob',
  'silk_wake',
  'tide_veil',
  'halo_rain',
  'mist_spiral',
  'anima',
]);

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
  onPickPaletteImage,
  background,
  onBackgroundChange,
}: ControlPanelProps) {
  const paletteImageInputRef = useRef<HTMLInputElement>(null);
  const autoGain = controls.autoGain ?? true;

  // All slider definitions (label, range, hint, fallback, grouping) come
  // from CONTROL_SCHEMA in @torus/visualizers — this component is just a
  // generic renderer plus the structural bits (selects, checkboxes).
  const presetControlKeys = VISUALIZERS[activePreset].presetControls ?? [];
  const presetSliders = presetControlKeys.map((key) => CONTROL_DEFS_BY_KEY[key]);

  const saved = unlocked ? loadSavedPresets() : [];
  void presetsVersion;

  const renderSlider = (def: ControlDef) => {
    const { key, min, max, step } = def;
    const label = autoGain && def.labelAutoGain ? def.labelAutoGain : def.label;
    const hint = autoGain && def.hintAutoGain ? def.hintAutoGain : def.hint;
    const value = (controls as unknown as Partial<Record<ControlKey, number>>)[key] ?? def.fallback;
    const outOfRange = value < min || value > max;
    const sliderValue = Math.max(min, Math.min(max, value));
    return (
      <div key={key} className="block text-xs text-torus-fg-dim">
        <div className="mb-1 flex justify-between">
          <span title={hint} className={hint ? 'cursor-help' : undefined}>
            {label}
          </span>
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
          aria-label={label}
          className="w-full accent-torus-mid"
        />
      </div>
    );
  };

  const renderControl = (key: ControlKey) => renderSlider(CONTROL_DEFS_BY_KEY[key]);

  const sectionSummary =
    'cursor-pointer select-none list-none text-xs font-medium text-torus-fg-dim hover:text-torus-fg [&::-webkit-details-marker]:hidden';
  const sectionChevron = (
    <span aria-hidden className="float-right text-torus-fg-faint transition-transform [[open]>summary>&]:rotate-90">
      ›
    </span>
  );

  return (
    <section className="rounded-xl border border-torus-border bg-torus-surface p-4">
      <h2 className="mb-3 text-sm font-medium text-torus-fg-dim">Controls</h2>

      <div className="space-y-3">
        <details open className="space-y-3">
          <summary className={sectionSummary}>
            Feel
            {sectionChevron}
          </summary>
          <label className="flex items-center justify-between gap-2 text-xs text-torus-fg-dim">
            <span className="flex flex-col">
              <span>Auto sensitivity</span>
              <span className="text-[10px] text-torus-fg-faint">
                Levels any track automatically — Intensity just trims it
              </span>
            </span>
            <input
              type="checkbox"
              checked={autoGain}
              onChange={(e) => onChange({ autoGain: e.target.checked })}
              className="accent-torus-mid"
            />
          </label>
          {controlsForGroup('feel').map(renderSlider)}
        </details>

        <details open className="space-y-3 border-t border-torus-border pt-3">
          <summary className={sectionSummary}>
            Color &amp; light
            {sectionChevron}
          </summary>
          {controlsForGroup('color').map(renderSlider)}
        </details>

        {presetSliders.length > 0 ? (
          <details open className="space-y-3 border-t border-torus-border pt-3">
            <summary className={sectionSummary}>
              This preset
              {sectionChevron}
            </summary>
            {presetSliders.map(renderSlider)}
          </details>
        ) : null}

        <details open className="space-y-3 border-t border-torus-border pt-3">
          <summary className={sectionSummary}>
            Framing &amp; camera
            {sectionChevron}
          </summary>
          {renderControl('scale')}
          <label className="block text-xs text-torus-fg-dim">
            Camera motion
            <select
              value={controls.cameraMode}
              onChange={(e) => onChange({ cameraMode: e.target.value as CameraMode })}
              className="mt-1 w-full rounded-lg border border-torus-border bg-torus-bg px-2 py-1.5 text-sm text-torus-fg"
            >
              {CAMERA_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {CAMERA_LABELS[mode]}
                </option>
              ))}
            </select>
          </label>

          {renderControl('cameraDistance')}
          {renderControl('bassShake')}
          {renderControl('depthOfField')}
          {controls.cameraMode === 'cinematic' ? renderControl('cinematicSpeed') : null}
        </details>

        <details className="space-y-3 border-t border-torus-border pt-3">
          <summary className={sectionSummary}>
            Bands (advanced)
            {sectionChevron}
          </summary>
          <BandSplitter
            analyser={analyser}
            palette={palette}
            bassMaxHz={controls.bassMaxHz ?? 250}
            midMaxHz={controls.midMaxHz ?? 2000}
            onChange={onChange}
          />
          {controlsForGroup('bands').map(renderSlider)}
        </details>

        <details className="space-y-2 border-t border-torus-border pt-3">
          <summary className={sectionSummary}>
            Background
            {sectionChevron}
          </summary>
          <label className="block text-xs text-torus-fg-dim">
            Background
            <select
              value={background.mode}
              onChange={(e) => onBackgroundChange({ mode: e.target.value as BackgroundMode })}
              className="mt-1 w-full rounded-lg border border-torus-border bg-torus-bg px-2 py-1.5 text-sm text-torus-fg"
            >
              {BACKGROUND_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {BACKGROUND_LABELS[mode]}
                </option>
              ))}
            </select>
          </label>
          {background.mode !== 'none' ? (
            <div className="block text-xs text-torus-fg-dim">
              <div className="mb-1 flex justify-between">
                <span>Background intensity</span>
                <EditableNumber
                  value={background.intensity}
                  onCommit={(v) => onBackgroundChange({ intensity: Math.max(0, Math.min(1, v)) })}
                  ariaLabel="Background intensity"
                  outOfRange={background.intensity < 0 || background.intensity > 1}
                />
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={Math.max(0, Math.min(1, background.intensity))}
                onChange={(e) => onBackgroundChange({ intensity: Number(e.target.value) })}
                aria-label="Background intensity"
                className="w-full accent-torus-mid"
              />
            </div>
          ) : null}
          {background.mode !== 'none' && FULLSCREEN_PRESETS.has(activePreset) ? (
            <p className="text-[10px] text-torus-fg-faint">
              This preset fills the whole frame, so the background sits hidden behind it.
              Try it with Torus Field, Galaxy Garden, or Cosmic Mandala.
            </p>
          ) : null}
        </details>

        <label className="flex items-center gap-2 border-t border-torus-border pt-3 text-xs text-torus-fg-dim">
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
          <button
            type="button"
            onClick={() => paletteImageInputRef.current?.click()}
            className="rounded-full border border-torus-mid/30 px-2 py-1 text-[10px] text-torus-mid hover:border-torus-mid/60"
            title="Pull bass / mid / high colors from any image (or album art)"
          >
            From image…
          </button>
          <input
            ref={paletteImageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPickPaletteImage(file);
              e.target.value = '';
            }}
          />
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
            <div className="grid grid-cols-2 gap-2">
              {saved.map((p) => (
                <div
                  key={p.id}
                  className="group relative overflow-hidden rounded-lg border border-torus-border bg-torus-bg"
                >
                  <button
                    type="button"
                    onClick={() => onLoadSaved(p)}
                    className="block w-full text-left"
                    title={`Load "${p.name}"`}
                  >
                    <div className="relative aspect-video w-full">
                      {p.thumbnail ? (
                        <img
                          src={p.thumbnail}
                          alt={`Preview of ${p.name}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <svg
                            width="28"
                            height="28"
                            viewBox="0 0 24 24"
                            fill="none"
                            aria-hidden="true"
                          >
                            <ellipse
                              cx="12"
                              cy="12"
                              rx="9"
                              ry="4.5"
                              stroke="var(--color-torus-mid)"
                              strokeWidth="1.5"
                              opacity="0.7"
                            />
                            <circle
                              cx="12"
                              cy="12"
                              r="2.3"
                              fill="var(--color-torus-mid)"
                              opacity="0.5"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                    <span className="block truncate px-2 py-1 text-[11px] text-torus-fg group-hover:text-torus-mid">
                      {p.name}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      persistSavedPresets(saved.filter((s) => s.id !== p.id));
                      onPresetsChange();
                    }}
                    aria-label={`Delete "${p.name}"`}
                    className="absolute right-1 top-1 rounded-full bg-torus-bg/80 px-1.5 py-0.5 text-[10px] leading-none text-torus-fg-faint backdrop-blur-sm hover:text-torus-bass"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
