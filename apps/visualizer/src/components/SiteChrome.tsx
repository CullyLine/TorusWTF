'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { AppLauncher } from '@/components/AppLauncher';
import { WelcomeToast } from '@/components/WelcomeToast';

/**
 * Global, uninvasive chrome rendered on every page: the app + account accordion
 * (top-left). Isolated, chrome-free tools like `/hd` and the offscreen prerender
 * root opt out by pathname.
 */
export function SiteChrome() {
  const pathname = usePathname();
  if (pathname.startsWith('/hd')) return null;
  return (
    <>
      <Suspense fallback={null}>
        <WelcomeToast />
      </Suspense>
      <AppLauncher />
    </>
  );
}
