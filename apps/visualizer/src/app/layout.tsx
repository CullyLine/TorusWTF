import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/Toast';
import { SiteChrome } from '@/components/SiteChrome';
import './globals.css';

// next/font downloads the files at build time and serves them from this
// origin, so pages make no request to Google.
const plex = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex',
  display: 'swap',
});

export const viewport: Viewport = {
  themeColor: '#0a0b1e',
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://torus.wtf'),
  title: { default: 'torus visualizer', template: '%s · torus visualizer' },
  description:
    'Turn any audio into 3D visuals and export them as video up to 4K. Works with a file, your mic, or audio from Spotify, Ableton, and other apps. Free, no account needed.',
  applicationName: 'torus visualizer',
  openGraph: {
    type: 'website',
    siteName: 'torus visualizer',
    title: 'torus visualizer: turn any audio into 3D visuals',
    description:
      'Play a file, use your mic, or capture audio from Spotify, Ableton, and other apps. Export video up to 4K. Free, no account needed.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'torus visualizer',
    description:
      'Turn any audio into 3D visuals and export them as video up to 4K. Free, no account needed.',
  },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={plex.variable} suppressHydrationWarning>
      <body className="min-h-dvh bg-torus-bg text-torus-fg antialiased font-sans">
        <ToastProvider>
          {children}
          <SiteChrome />
        </ToastProvider>
      </body>
    </html>
  );
}
