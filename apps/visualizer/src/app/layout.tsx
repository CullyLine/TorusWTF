import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/Toast';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://torus-visualizer.vercel.app'),
  title: { default: 'torus visualizer', template: '%s · torus visualizer' },
  description:
    'Turn any audio into beautiful 3D visuals — Spotify, Ableton, Splice, or your mic. Export for Reels, Shorts, and portfolios.',
  applicationName: 'torus visualizer',
  themeColor: '#0a0b1e',
  openGraph: {
    type: 'website',
    siteName: 'torus visualizer',
    title: 'torus visualizer — turn any audio into 3D visuals',
    description:
      'Capture audio from Spotify, Ableton, Splice, or your mic in real time. Nine reactive presets including the new infinite Mandelbrot Zoom. Free.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'torus visualizer',
    description:
      'Turn any audio into beautiful 3D visuals — Spotify, Ableton, Splice, or your mic. Nine reactive presets, no signup.',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh bg-torus-bg text-torus-fg antialiased font-sans">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
