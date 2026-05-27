import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './hd.css';

/**
 * Layout for the hidden /hd order-puller tool. Notably:
 *   - Strict noindex / nofollow so search engines never list it.
 *   - Light color-scheme override so it stays readable under store
 *     fluorescent lighting regardless of OS-level dark mode.
 *   - No torus branding, no shared components, no chrome.
 */

export const metadata: Metadata = {
  title: 'HD · Hickory',
  description: 'Internal stock lookup.',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export const viewport: Viewport = {
  themeColor: '#fafafa',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  colorScheme: 'light',
};

export default function HdLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
