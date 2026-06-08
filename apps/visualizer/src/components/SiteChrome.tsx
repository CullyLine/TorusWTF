'use client';

import { usePathname } from 'next/navigation';
import { AppLauncher } from '@/components/AppLauncher';
import { AccountMenu } from '@/components/AccountMenu';

/**
 * Global, uninvasive chrome rendered on every page: the app accordion (top-left)
 * and the account menu (top-right). Isolated, chrome-free tools like `/hd` and
 * the offscreen prerender root opt out by pathname.
 */
export function SiteChrome() {
  const pathname = usePathname();
  if (pathname.startsWith('/hd')) return null;
  return (
    <>
      <AppLauncher />
      <AccountMenu />
    </>
  );
}
