'use client';

import { ConductorProvider } from '@/lib/conductor/store';
import { ConductorShell } from './ConductorShell';

/**
 * Conductor — a basic SoundFont DAW for torus.wtf.
 * Lazy-loaded sibling of the visualizer; everything below runs client-side.
 */
export function ConductorApp() {
  return (
    <ConductorProvider>
      <ConductorShell />
    </ConductorProvider>
  );
}
