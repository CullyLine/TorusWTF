import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'torus.wtf', template: '%s · torus.wtf' },
  description: 'Share the loop. Drop any audio, get an instant link.',
  applicationName: 'torus.wtf',
  authors: [{ name: 'torus.wtf contributors' }],
  themeColor: '#0a0b1e',
  openGraph: {
    type: 'website',
    siteName: 'torus.wtf',
    title: 'torus.wtf',
    description: 'Share the loop. Drop any audio, get an instant link.',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'torus.wtf' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'torus.wtf',
    description: 'Share the loop. Drop any audio, get an instant link.',
  },
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh bg-torus-bg text-torus-fg antialiased font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
