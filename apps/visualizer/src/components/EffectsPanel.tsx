'use client';

import {
  EMITTER_CONTROLS,
  EMITTER_KINDS,
  EMITTER_REGISTRY,
  SCREEN_EFFECT_OPTIONS,
  SCREEN_EFFECT_REGISTRY,
  sanitizeEmitterSettings,
  sanitizeScreenEffectSettings,
  type EmitterKind,
  type EmitterSettings,
  type ScreenEffectId,
  type ScreenEffectSettings,
} from '@torus/visualizers';
import { EditableNumber } from '@/components/EditableNumber';

interface EffectsPanelProps {
  screenEffect: ScreenEffectSettings;
  onScreenEffectChange: (next: ScreenEffectSettings) => void;
  emitter: EmitterSettings;
  onEmitterChange: (next: EmitterSettings) => void;
  highlightProtection: boolean;
  onHighlightProtectionChange: (enabled: boolean) => void;
}

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

  const selectedScreenEffect = SCREEN_EFFECT_REGISTRY[screenEffect.id];
  const selectedEmitter = EMITTER_REGISTRY[emitter.kind];

  return (
    <section className="rounded-xl border border-torus-border bg-torus-surface p-4">
      <h2 className="mb-3 text-sm font-medium text-torus-fg-dim">Effects</h2>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="block text-xs text-torus-fg-dim">
            Screen style
            <select
              value={screenEffect.id}
              onChange={(event) =>
                updateScreenEffect({ id: event.target.value as ScreenEffectId })
              }
              className="mt-1 w-full rounded-lg border border-torus-border bg-torus-bg px-2 py-1.5 text-sm text-torus-fg"
            >
              {SCREEN_EFFECT_OPTIONS.map((effect) => (
                <option key={effect.id} value={effect.id}>
                  {effect.label}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[10px] text-torus-fg-faint">{selectedScreenEffect.description}</p>

          <div className="block text-xs text-torus-fg-dim">
            <div className="mb-1 flex items-center justify-between">
              <span>Wet / dry</span>
              <span className="tabular-nums text-[10px] text-torus-fg-faint">
                {Math.round(screenEffect.mix * 100)}% wet
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={screenEffect.mix}
              onChange={(event) => updateScreenEffect({ mix: Number(event.target.value) })}
              disabled={screenEffect.id === 'none'}
              aria-label="Screen effect wet dry"
              className="w-full accent-torus-mid disabled:opacity-40"
            />
          </div>
        </div>

        <div className="space-y-2 border-t border-torus-border pt-3">
          <label className="block text-xs text-torus-fg-dim">
            Emitter layer
            <select
              value={emitter.kind}
              onChange={(event) => updateEmitter({ kind: event.target.value as EmitterKind })}
              className="mt-1 w-full rounded-lg border border-torus-border bg-torus-bg px-2 py-1.5 text-sm text-torus-fg"
            >
              {EMITTER_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {EMITTER_REGISTRY[kind].label}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[10px] text-torus-fg-faint">{selectedEmitter.hint}</p>

          {emitter.kind === 'bubbles' ? (
            <div className="space-y-2 pt-1">
              {EMITTER_CONTROLS.map((control) => {
                const value = emitter[control.setting];
                return (
                  <div key={control.key} className="block text-xs text-torus-fg-dim">
                    <div className="mb-1 flex justify-between">
                      <span title={control.hint} className="cursor-help">
                        {control.label}
                      </span>
                      <EditableNumber
                        value={value}
                        onCommit={(next) => updateEmitter({ [control.setting]: next })}
                        ariaLabel={`Emitter ${control.label}`}
                        outOfRange={value < control.min || value > control.max}
                      />
                    </div>
                    <input
                      type="range"
                      min={control.min}
                      max={control.max}
                      step={control.step}
                      value={Math.max(control.min, Math.min(control.max, value))}
                      onChange={(event) =>
                        updateEmitter({ [control.setting]: Number(event.target.value) })
                      }
                      aria-label={`Emitter ${control.label}`}
                      className="w-full accent-torus-mid"
                    />
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <label className="flex items-start justify-between gap-3 border-t border-torus-border pt-3 text-xs text-torus-fg-dim">
          <span>
            Highlight protection
            <span className="mt-0.5 block text-[10px] text-torus-fg-faint">
              Keeps bright effects colorful instead of clipping to white
            </span>
          </span>
          <input
            type="checkbox"
            checked={highlightProtection}
            onChange={(event) => onHighlightProtectionChange(event.target.checked)}
            className="mt-0.5 accent-torus-mid"
          />
        </label>
      </div>
    </section>
  );
}
