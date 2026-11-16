'use client';

import { controlsForGroup, type AnalyserHandle } from '@torus/visualizers';
import type { WaveformPalette } from '@torus/shared';
import { BandSplitter } from '@/components/panels/BandSplitter';
import { CheckboxField, Hint, Section, SliderField } from '@/components/ui/controls';
import type { VisualizerControls } from '@/lib/storage';

interface BandsPanelProps {
  analyser: AnalyserHandle | null;
  palette: WaveformPalette;
  controls: VisualizerControls;
  onChange: (patch: Partial<VisualizerControls>) => void;
  showBpm: boolean;
  onShowBpmChange: (show: boolean) => void;
}

/** How the audio is split into bass, mid, and high, plus the tempo readout. */
export function BandsPanel({
  analyser,
  palette,
  controls,
  onChange,
  showBpm,
  onShowBpmChange,
}: BandsPanelProps) {
  return (
    <Section title="Analysis" defaultOpen={false}>
      <CheckboxField
        label="Show tempo on the stage"
        hint="Displays the detected BPM in the corner of the preview. It is never exported."
        checked={showBpm}
        onChange={onShowBpmChange}
      />
      <Hint>
        Drag the two handles to set where bass ends and where highs begin. Each visualizer reacts to
        the three bands separately.
      </Hint>
      <BandSplitter
        analyser={analyser}
        palette={palette}
        bassMaxHz={controls.bassMaxHz ?? 250}
        midMaxHz={controls.midMaxHz ?? 2000}
        onChange={onChange}
      />
      {controlsForGroup('bands').map((def) => (
        <SliderField
          key={def.key}
          label={def.label}
          hint={def.hint}
          value={
            (controls as unknown as Record<string, number | undefined>)[def.key] ?? def.fallback
          }
          min={def.min}
          max={def.max}
          step={def.step}
          onChange={(next) => onChange({ [def.key]: next })}
          unbounded
        />
      ))}
    </Section>
  );
}
