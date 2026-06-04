import type { ReactNode } from 'react';
import { AppLauncher } from '@/components/AppLauncher';

/**
 * Shared shell for the torus.wtf "studio" apps (visualizer + Conductor).
 * Renders the corner AppLauncher on top of every app in this group.
 * Route groups don't affect the URL, so the visualizer stays at `/`.
 * Isolated tools like `/hd` live outside this group and get no chrome.
 */
export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <AppLauncher />
    </>
  );
}
