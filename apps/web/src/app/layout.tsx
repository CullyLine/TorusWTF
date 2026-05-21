import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'torus.fm', template: '%s · torus.fm' },
  description: 'Share the loop. Drop any audio, get an instant link.',
  applicationName: 'torus.fm',
  authors: [{ name: 'torus.fm contributors' }],
  themeColor: '#0a0b1e',
  openGraph: {
    type: 'website',
    siteName: 'torus.fm',
    title: 'torus.fm',
    description: 'Share the loop. Drop any audio, get an instant link.',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'torus.fm' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'torus.fm',
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
