'use client';

import { useEffect, useState } from 'react';
import { Waveform } from '@torus/ui';
import type { PeaksJson, WaveformPalette } from '@torus/shared';

interface EmbedClientProps {
  shareCode: string;
  title: string | null;
  audioUrl: string | null;
  peaksUrl: string | null;
  palette: WaveformPalette | null;
}

export function EmbedClient({ shareCode, title, audioUrl, peaksUrl, palette }: EmbedClientProps) {
  const [peaks, setPeaks] = useState<PeaksJson | null>(null);

  useEffect(() => {
    if (!peaksUrl) return;
    let cancelled = false;
    fetch(peaksUrl)
      .then((r) => r.json())
      .then((j: PeaksJson) => {
        if (!cancelled) setPeaks(j);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [peaksUrl]);

  return (
    <main className="flex min-h-dvh flex-col bg-torus-bg p-4 text-torus-fg">
      <div className="mb-3 flex items-center justify-between">
        <a
          href={`/${shareCode}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-torus-fg-dim hover:underline"
        >
          {title ?? 'untitled'} ↗
        </a>
        <span className="text-[10px] text-torus-fg-faint">torus.wtf</span>
      </div>
      <Waveform
        peaks={peaks ?? undefined}
        palette={palette ?? undefined}
        audioUrl={audioUrl ?? undefined}
        height={100}
        particles={false}
      />
    </main>
  );
}
