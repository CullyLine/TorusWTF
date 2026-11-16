'use client';

interface BPMIndicatorProps {
  bpm: number | null;
  /** False while the detector has not settled on a tempo yet. */
  confident: boolean;
}

/** The detected tempo, shown on the stage. It is never part of an export. */
export function BPMIndicator({ bpm, confident }: BPMIndicatorProps) {
  return (
    <div
      className="rounded-md bg-torus-panel px-2.5 py-1 text-xs tabular-nums text-torus-fg-dim"
      aria-live="polite"
    >
      {confident && bpm != null ? `${bpm} BPM` : 'Detecting tempo'}
    </div>
  );
}
