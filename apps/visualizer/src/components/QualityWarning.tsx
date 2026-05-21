'use client';

import type { ExportFps, ExportResolution } from '@/lib/export-config';

interface QualityWarningProps {
  resolution: ExportResolution;
  fps: ExportFps;
}

export function QualityWarning({ resolution, fps }: QualityWarningProps) {
  const heavy = resolution === '4k' && fps >= 120;
  if (!heavy) return null;

  return (
    <p className="mb-3 rounded-lg border border-torus-high/30 bg-torus-high/10 px-3 py-2 text-xs text-torus-high">
      4K at {fps} FPS may stutter on many GPUs. Consider 1080p or 60 FPS for smoother exports.
    </p>
  );
}
