'use client';

import {
  BACKGROUND_MODES,
  CONTROL_DEFS_BY_KEY,
  VISUALIZERS,
  controlsForGroup,
  type BackgroundMode,
  type CameraMode,
  type ControlDef,
  type ControlKey,
  type VisualizerId,
} from '@torus/visualizers';
import { CheckboxField, Hint, Section, SelectField, SliderField } from '@/components/ui/controls';
import type { BackgroundSettings, VisualizerControls } from '@/lib/storage';

interface LookControlsProps {
  controls: VisualizerControls;
  onChange: (patch: Partial<VisualizerControls>) => void;
  activePreset: VisualizerId;
  background: BackgroundSettings;
  onBackgroundChange: (patch: Partial<BackgroundSettings>) => void;
}

const CAMERA_OPTIONS: ReadonlyArray<{ value: CameraMode; label: string }> = [
  { value: 'still', label: 'Still' },
  { value: 'drift', label: 'Drift: slow float' },
  { value: 'orbit', label: 'Orbit: circle the scene' },
  { value: 'dive', label: 'Dive: push forward' },
  { value: 'cinematic', label: 'Cinematic: directed automatically' },
  { value: 'flow', label: 'Flow: ride the current' },
];

const BACKGROUND_LABELS: Record<BackgroundMode, string> = {
  none: 'None',
  nebula: 'Nebula',
  starfield: 'Star field',
  aurora: 'Aurora',
  glow: 'Glow',
};

const BACKGROUND_OPTIONS = BACKGROUND_MODES.map((mode) => ({
  value: mode,
  label: BACKGROUND_LABELS[mode],
}));

// These visualizers paint the whole frame themselves, so a background sits
// hidden behind them.
const FULL_FRAME_VISUALIZERS: ReadonlySet<VisualizerId> = new Set<VisualizerId>([
  'liquid_blob',
  'tidal_sanctuary',
]);

/**
 * The sliders that shape a look. Every slider definition (label, range, hint,
 * fallback, group) comes from `CONTROL_SCHEMA` in `@torus/visualizers`. This
 * component only decides which group goes in which section.
 */
export function LookControls({
  controls,
  onChange,
  activePreset,
  background,
  onBackgroundChange,
}: LookControlsProps) {
  const autoGain = controls.autoGain ?? true;
  const visualizerControlKeys = VISUALIZERS[activePreset].presetControls ?? [];

  const renderSlider = (def: ControlDef) => {
    const value =
      (controls as unknown as Partial<Record<ControlKey, number>>)[def.key] ?? def.fallback;
    return (
      <SliderField
        key={def.key}
        label={autoGain && def.labelAutoGain ? def.labelAutoGain : def.label}
        hint={autoGain && def.hintAutoGain ? def.hintAutoGain : def.hint}
        value={value}
        min={def.min}
        max={def.max}
        step={def.step}
        onChange={(next) => onChange({ [def.key]: next })}
        unbounded
      />
    );
  };

  const renderControl = (key: ControlKey) => renderSlider(CONTROL_DEFS_BY_KEY[key]);

  return (
    <>
      <Section title="Feel">
        <CheckboxField
          label="Auto sensitivity"
          hint="Levels any track automatically. Intensity then trims the result."
          checked={autoGain}
          onChange={(checked) => onChange({ autoGain: checked })}
        />
        {controlsForGroup('feel').map(renderSlider)}
      </Section>

      <Section title="Color and light">{controlsForGroup('color').map(renderSlider)}</Section>

      {visualizerControlKeys.length > 0 ? (
        <Section title={`${VISUALIZERS[activePreset].label} settings`}>
          {visualizerControlKeys.map(renderControl)}
        </Section>
      ) : null}

      <Section title="Camera">
        {renderControl('scale')}
        <SelectField
          label="Camera motion"
          value={controls.cameraMode}
          options={CAMERA_OPTIONS}
          onChange={(cameraMode) => onChange({ cameraMode })}
        />
        {renderControl('cameraDistance')}
        {renderControl('bassShake')}
        {renderControl('depthOfField')}
        {controls.cameraMode === 'cinematic' ? renderControl('cinematicSpeed') : null}
      </Section>

      <Section title="Background" defaultOpen={false}>
        <SelectField
          label="Backdrop"
          value={background.mode}
          options={BACKGROUND_OPTIONS}
          onChange={(mode) => onBackgroundChange({ mode })}
        />
        {background.mode !== 'none' ? (
          <SliderField
            label="Backdrop intensity"
            value={background.intensity}
            min={0}
            max={1}
            step={0.05}
            onChange={(intensity) => onBackgroundChange({ intensity })}
          />
        ) : null}
        {background.mode !== 'none' && FULL_FRAME_VISUALIZERS.has(activePreset) ? (
          <Hint>
            This visualizer fills the whole frame, so the backdrop is hidden behind it. Torus Field,
            Galaxy Garden, and Cosmic Mandala show it.
          </Hint>
        ) : null}
      </Section>
    </>
  );
}
