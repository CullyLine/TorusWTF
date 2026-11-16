'use client';

import {
  EMITTER_CONTROLS,
  EMITTER_KINDS,
  EMITTER_REGISTRY,
  SCREEN_EFFECT_OPTIONS,
  SCREEN_EFFECT_REGISTRY,
  sanitizeEmitterSettings,
  sanitizeScreenEffectSettings,
  type EmitterSettings,
  type ScreenEffectSettings,
} from '@torus/visualizers';
import { CheckboxField, Hint, Section, SelectField, SliderField } from '@/components/ui/controls';

interface EffectsPanelProps {
  screenEffect: ScreenEffectSettings;
  onScreenEffectChange: (next: ScreenEffectSettings) => void;
  emitter: EmitterSettings;
  onEmitterChange: (next: EmitterSettings) => void;
  highlightProtection: boolean;
  onHighlightProtectionChange: (enabled: boolean) => void;
}

const SCREEN_EFFECT_SELECT_OPTIONS = SCREEN_EFFECT_OPTIONS.map((effect) => ({
  value: effect.id,
  label: effect.label,
}));

const EMITTER_SELECT_OPTIONS = EMITTER_KINDS.map((kind) => ({
  value: kind,
  label: EMITTER_REGISTRY[kind].label,
}));

/** Whole-frame screen styles and the particle layer drawn over every visualizer. */
export function EffectsPanel({
  screenEffect,
  onScreenEffectChange,
  emitter,
  onEmitterChange,
  highlightProtection,
  onHighlightProtectionChange,
}: EffectsPanelProps) {
  const updateScreenEffect = (patch: Partial<ScreenEffectSettings>) => {
    onScreenEffectChange(sanitizeScreenEffectSettings({ ...screenEffect, ...patch }));
  };

  const updateEmitter = (patch: Partial<EmitterSettings>) => {
    onEmitterChange(sanitizeEmitterSettings({ ...emitter, ...patch }));
  };

  return (
    <>
      <Section title="Screen style" defaultOpen={false}>
        <SelectField
          label="Style"
          value={screenEffect.id}
          options={SCREEN_EFFECT_SELECT_OPTIONS}
          onChange={(id) => updateScreenEffect({ id })}
        />
        <Hint>{SCREEN_EFFECT_REGISTRY[screenEffect.id].description}</Hint>
        <SliderField
          label="Amount"
          value={screenEffect.mix}
          min={0}
          max={1}
          step={0.01}
          onChange={(mix) => updateScreenEffect({ mix })}
          readout={<span className="tabular-nums">{Math.round(screenEffect.mix * 100)}%</span>}
          disabled={screenEffect.id === 'none'}
        />
        <CheckboxField
          label="Highlight protection"
          hint="Keeps bright areas colorful instead of clipping to white."
          checked={highlightProtection}
          onChange={onHighlightProtectionChange}
        />
      </Section>

      <Section title="Particle layer" defaultOpen={false}>
        <SelectField
          label="Particles"
          value={emitter.kind}
          options={EMITTER_SELECT_OPTIONS}
          onChange={(kind) => updateEmitter({ kind })}
        />
        <Hint>{EMITTER_REGISTRY[emitter.kind].hint}</Hint>
        {emitter.kind === 'bubbles'
          ? EMITTER_CONTROLS.map((control) => (
              <SliderField
                key={control.key}
                label={control.label}
                hint={control.hint}
                value={emitter[control.setting]}
                min={control.min}
                max={control.max}
                step={control.step}
                onChange={(next) => updateEmitter({ [control.setting]: next })}
                unbounded
              />
            ))
          : null}
      </Section>
    </>
  );
}
