'use client';

import { useRef } from 'react';
import {
  BACKGROUND_MODES,
  type AnalyserHandle,
  type BackgroundMode,
  type CameraMode,
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

// Presets that paint their own fullscreen background — the layer is hidden
// behind them, so we surface a hint rather than letting it look broken.
const FULLSCREEN_PRESETS: ReadonlySet<VisualizerId> = new Set<VisualizerId>([
  'liquid_blob',
  'anima',
  'mandelbrot_zoom',
]);

const CINEMATIC_SPEED_MIN = 0.25;
const CINEMATIC_SPEED_MAX = 3;
const CINEMATIC_SPEED_STEP = 0.05;

type SliderKey = Exclude<keyof VisualizerControls, 'cameraMode' | 'autoGain'>;

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
  type SliderDef = {
    key: SliderKey;
    label: string;
    min: number;
    max: number;
    step: number;
    /** Plain-language tooltip for jargon-y controls. */
    hint?: string;
  };
  const autoGain = controls.autoGain ?? true;
  // The Pulse Update panel: grouped by intent (how it feels / how it's lit
  // and colored / how it's framed), with ranges tightened to the musical
  // zone — the old 0–12.5 ranges left 95% of each slider useless.
  const feelSliders: SliderDef[] = [
    {
      key: 'reactivity',
      label: autoGain ? 'Intensity (trim)' : 'Intensity',
      min: 0.2,
      max: 4,
      step: 0.05,
      hint: autoGain
        ? 'How big the visuals move — fine-tune on top of auto sensitivity'
        : 'How big the visuals move with the audio',
    },
    { key: 'energy', label: 'Punch', min: 0, max: 2, step: 0.05, hint: 'Extra snap on hits — drums land harder without raising the quiet parts' },
    { key: 'smoothness', label: 'Flow', min: 0, max: 0.95, step: 0.01, hint: 'How silkily motion glides between hits — hits still land instantly' },
    { key: 'speed', label: 'Speed', min: 0.25, max: 3, step: 0.05, hint: 'Pace of the motion' },
    { key: 'anima', label: 'Life', min: 0, max: 1, step: 0.01, hint: 'How alive the scene stays between beats — breathing, drifting attention' },
  ];
  const colorSliders: SliderDef[] = [
    { key: 'colorLife', label: 'Color life', min: 0, max: 1, step: 0.01, hint: 'Colors breathe with loudness, drift over time, and shift on drops' },
    { key: 'bloomIntensity', label: 'Glow', min: 0, max: 3, step: 0.05, hint: 'Bloom around bright areas — swells with the music' },
    { key: 'lightLevel', label: 'Light', min: 0.2, max: 2, step: 0.05, hint: 'Overall brightness of the world' },
    { key: 'aura', label: 'Aura', min: 0, max: 1, step: 0.01, hint: 'Ambient wisp field around the scene' },
  ];
  const framingSliders: SliderDef[] = [
    { key: 'scale', label: 'Size', min: 0.2, max: 3, step: 0.05, hint: 'How much of the frame the scene fills' },
    { key: 'bassShake', label: 'Shake', min: 0, max: 3, step: 0.05, hint: 'Subwoofer camera rumble on heavy bass' },
  ];
  const bandSliders: SliderDef[] = [
    { key: 'bassMix', label: 'Bass', min: 0, max: 4, step: 0.05, hint: 'How much the low end drives the visuals' },
    { key: 'midMix', label: 'Mid', min: 0, max: 4, step: 0.05, hint: 'How much the mids drive the visuals' },
    { key: 'highMix', label: 'High', min: 0, max: 4, step: 0.05, hint: 'How much the highs drive the visuals' },
  ];
  const blobSliders: SliderDef[] = [
    { key: 'inflate', label: 'Inflate', min: 0, max: 1, step: 0.01, hint: '0 = stretchy taffy, 1 = round puff' },
    { key: 'appendages', label: 'Appendages', min: 0, max: 10, step: 1, hint: 'Orbiting satellite spheres that fuse into the blob' },
    { key: 'subSpheres', label: 'Sub-spheres', min: 0, max: 8, step: 1, hint: 'Big fluid bubbles on hi-hats and cymbals' },
  ];
  const showBlobSliders = activePreset === 'liquid_blob';
  const flowSliders: SliderDef[] = [
    { key: 'turbulence', label: 'Turbulence', min: 0, max: 2, step: 0.05, hint: 'Fine chaotic detail in the current' },
    { key: 'trailLength', label: 'Trails', min: 0, max: 2, step: 0.05, hint: 'How long each particle\u2019s ink trail is' },
    { key: 'density', label: 'Density', min: 0.05, max: 1, step: 0.05, hint: 'Fraction of the swarm that\u2019s visible' },
    { key: 'vortexAmount', label: 'Vortex', min: 0, max: 1, step: 0.05, hint: 'Tornado pull at the center of the field' },
    { key: 'interactStrength', label: 'Stir', min: 0, max: 2, step: 0.05, hint: 'How strongly your cursor stirs the current' },
  ];
  const showFlowSliders = activePreset === 'flow_field';
  // The tunnel's particle stream reuses a subset of the flow controls
  // (trails and cursor-stir don't apply to it).
  const tunnelSliders = flowSliders.filter((s) =>
    ['turbulence', 'density', 'vortexAmount'].includes(s.key),
  );
  const showTunnelSliders = activePreset === 'infinite_tunnel';

  const saved = unlocked ? loadSavedPresets() : [];
  void presetsVersion;

  const renderSlider = ({ key, label, min, max, step, hint }: SliderDef) => {
    // Smoothness/Scale/BassShake/Anima/Aura/Inflate/Appendages were
    // added later, so older persisted controls may not have them.
    // Default per-slider.
    const fallback =
      key === 'scale' ||
      key === 'cameraDistance' ||
      key === 'lightLevel' ||
      key === 'turbulence' ||
      key === 'trailLength' ||
      key === 'density' ||
      key === 'interactStrength'
        ? 1
        : key === 'anima'
          ? 0.5
          : key === 'aura'
            ? 0.4
            : key === 'colorLife'
              ? 0.6
              : key === 'inflate'
                ? 0.5
                : key === 'vortexAmount'
                  ? 0.25
                  : key === 'appendages'
                    ? 4
                    : key === 'subSpheres'
                      ? 6
                      : 0;
    const value = controls[key] ?? fallback;
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
          {feelSliders.map(renderSlider)}
        </details>

        <details open className="space-y-3 border-t border-torus-border pt-3">
          <summary className={sectionSummary}>
            Color &amp; light
            {sectionChevron}
          </summary>
          {colorSliders.map(renderSlider)}
        </details>

        {showBlobSliders || showFlowSliders || showTunnelSliders ? (
          <details open className="space-y-3 border-t border-torus-border pt-3">
            <summary className={sectionSummary}>
              This preset
              {sectionChevron}
            </summary>
            {showBlobSliders ? blobSliders.map(renderSlider) : null}
            {showFlowSliders ? flowSliders.map(renderSlider) : null}
            {showTunnelSliders ? tunnelSliders.map(renderSlider) : null}
          </details>
        ) : null}

        <details open className="space-y-3 border-t border-torus-border pt-3">
          <summary className={sectionSummary}>
            Framing &amp; camera
            {sectionChevron}
          </summary>
          {renderSlider(framingSliders[0]!)}
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

          {renderSlider({
            key: 'cameraDistance',
            label: 'Distance',
            min: 0.5,
            max: 2.5,
            step: 0.05,
            hint: 'How far the camera sits from the center — it never gets close enough to clip into the scene',
          })}
          {renderSlider(framingSliders[1]!)}

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
                      aria-label="Cinematic speed"
                      className="w-full accent-torus-mid"
                    />
                  </div>
                );
              })()
            : null}
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
          {bandSliders.map(renderSlider)}
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
              Try it with Torus Field, Star Field, or Cosmic Mandala.
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
