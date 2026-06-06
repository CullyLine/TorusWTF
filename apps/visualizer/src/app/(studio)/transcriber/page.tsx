'use client';

import dynamic from 'next/dynamic';

// Lazy + client-only: keeps TensorFlow.js / Basic Pitch and the spessasynth
// preview engine out of the visualizer bundle and off the server (Web Audio +
// localStorage only exist in the browser).
const TranscriberApp = dynamic(
  () => import('@/components/transcriber/TranscriberApp').then((m) => m.TranscriberApp),
  {
    ssr: false,
    loading: () => (
      <div className="grid min-h-dvh place-items-center bg-torus-bg text-sm text-torus-fg-dim">
        Loading Transcriber{'\u2026'}
      </div>
    ),
  },
);

export default function TranscriberPage() {
  return <TranscriberApp />;
}
