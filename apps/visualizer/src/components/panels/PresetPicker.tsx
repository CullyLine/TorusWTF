'use client';

import { VISUALIZERS, type VisualizerId } from '@torus/visualizers';
import { Hint, Section, TextButton, cx } from '@/components/ui/controls';

interface PresetPickerProps {
  active: VisualizerId;
  onChange: (id: VisualizerId) => void;
  onRandom: () => void;
}

const VISUALIZER_IDS = Object.keys(VISUALIZERS) as VisualizerId[];

/** The grid of visualizers. The registry in `@torus/visualizers` is the source of the list. */
export function PresetPicker({ active, onChange, onRandom }: PresetPickerProps) {
  return (
    <Section
      title="Visualizer"
      action={
        <TextButton onClick={onRandom} title="Pick a random visualizer (R)">
          Random
        </TextButton>
      }
    >
      <div className="grid grid-cols-2 gap-1.5">
        {VISUALIZER_IDS.map((id) => {
          const selected = active === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(id)}
              title={VISUALIZERS[id].hint}
              className={cx(
                'rounded-md border px-2.5 py-2 text-left text-xs font-medium transition-colors',
                selected
                  ? 'border-torus-mid bg-torus-raised text-torus-fg'
                  : 'border-torus-border text-torus-fg-dim hover:border-torus-border-strong hover:text-torus-fg',
              )}
            >
              {VISUALIZERS[id].label}
            </button>
          );
        })}
      </div>
      <Hint>{VISUALIZERS[active].hint}</Hint>
    </Section>
  );
}
