'use client';

import dynamic from 'next/dynamic';

// Lazy + client-only: keeps the spessasynth engine and DAW UI out of the
// visualizer bundle and off the server (it needs Web Audio + localStorage).
const ConductorApp = dynamic(
  () => import('@/components/conductor/ConductorApp').then((m) => m.ConductorApp),
  {
    ssr: false,
    loading: () => (
      <div className="grid min-h-dvh place-items-center bg-torus-bg text-sm text-torus-fg-dim">
        Loading Conductor{'\u2026'}
      </div>
    ),
  },
);

export default function ConductorPage() {
  return <ConductorApp />;
}
