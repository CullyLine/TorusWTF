import type { ReactNode } from 'react';

/**
 * Route group for the torus "studio" apps (visualizer + Conductor + Transcriber).
 * Route groups don't affect the URL, so the visualizer stays at `/`. The global
 * chrome (app accordion + account menu) now lives in the root layout, so this
 * group is just a passthrough.
 */
export default function StudioLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
