'use client';

import {
  CheckboxField,
  Hint,
  Section,
  SelectField,
  SliderField,
  cx,
  inputClass,
} from '@/components/ui/controls';
import type { OverlayPosition, TitleOverlay } from '@/lib/storage';

interface TitleOverlayPanelProps {
  overlay: TitleOverlay;
  onChange: (patch: Partial<TitleOverlay>) => void;
}

const POSITIONS: ReadonlyArray<{ value: OverlayPosition; label: string }> = [
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-center', label: 'Bottom center' },
  { value: 'top-left', label: 'Top left' },
  { value: 'top-right', label: 'Top right' },
];

/** The track title card that is drawn onto exported video. */
export function TitleOverlayPanel({ overlay, onChange }: TitleOverlayPanelProps) {
  return (
    <Section title="Title card" defaultOpen={false}>
      <CheckboxField
        label="Add a title card to exports"
        hint="Drawn onto the video only. The live preview never shows it."
        checked={overlay.enabled}
        onChange={(enabled) => onChange({ enabled })}
      />

      <label className="block text-xs text-torus-fg-dim">
        Title
        <input
          type="text"
          value={overlay.title}
          placeholder="Track name"
          onChange={(e) => onChange({ title: e.target.value })}
          className={cx(inputClass, 'mt-1 w-full')}
        />
      </label>
      <label className="block text-xs text-torus-fg-dim">
        Subtitle
        <input
          type="text"
          value={overlay.subtitle}
          placeholder="Artist"
          onChange={(e) => onChange({ subtitle: e.target.value })}
          className={cx(inputClass, 'mt-1 w-full')}
        />
      </label>
      <Hint>A file with embedded tags fills these in when you load it.</Hint>

      <SelectField
        label="Position"
        value={overlay.position}
        options={POSITIONS}
        onChange={(position) => onChange({ position })}
      />
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-torus-fg-dim">
          Text color
          <input
            type="color"
            value={overlay.textColor}
            onChange={(e) => onChange({ textColor: e.target.value })}
            className="mt-1 h-8 w-full cursor-pointer rounded-md border border-torus-border bg-transparent"
          />
        </label>
        <SliderField
          label="Bar opacity"
          value={overlay.bgOpacity}
          min={0}
          max={1}
          step={0.05}
          onChange={(bgOpacity) => onChange({ bgOpacity })}
          readout={<span className="tabular-nums">{Math.round(overlay.bgOpacity * 100)}%</span>}
        />
      </div>
    </Section>
  );
}
