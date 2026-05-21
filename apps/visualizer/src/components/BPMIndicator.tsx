'use client';

interface BPMIndicatorProps {
  bpm: number | null;
  confident: boolean;
  visible: boolean;
  fileSource: boolean;
  className?: string;
}

export function BPMIndicator({
  bpm,
  confident,
  visible,
  fileSource,
  className = '',
}: BPMIndicatorProps) {
  if (!visible) return null;

  const label = confident && bpm != null ? `${bpm} BPM` : '—';
  const position = fileSource ? 'bottom-14 left-3' : 'bottom-3 left-3';

  return (
    <div
      className={`absolute ${position} rounded-full border border-torus-border bg-torus-bg/80 px-3 py-1 text-xs font-mono text-torus-mid backdrop-blur-sm ${className}`}
      aria-live="polite"
    >
      {label}
    </div>
  );
}
