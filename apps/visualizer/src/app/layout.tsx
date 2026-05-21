import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'torus visualizer', template: '%s · torus visualizer' },
  description: 'Turn any audio into beautiful 3D visuals. Export for Reels, Shorts, and portfolios.',
  applicationName: 'torus visualizer',
  themeColor: '#0a0b1e',
  openGraph: {
    type: 'website',
    siteName: 'torus visualizer',
    title: 'torus visualizer',
    description: 'Turn any audio into beautiful 3D visuals.',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh bg-torus-bg text-torus-fg antialiased font-sans">{children}</body>
    </html>
  );
}
