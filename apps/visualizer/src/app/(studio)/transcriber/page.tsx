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
      <div className="grid min-h-dvh place-items-center bg-torus-bg px-4 text-center">
        <div>
          <p className="text-sm text-torus-fg-dim">Loading Transcriber{'\u2026'}</p>
          <p className="mt-2 text-xs text-torus-fg-faint">
            The ML transcription model loads on your first transcribe.
          </p>
        </div>
      </div>
    ),
  },
);

export default function TranscriberPage() {
  return <TranscriberApp />;
}
