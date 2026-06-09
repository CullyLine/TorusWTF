import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Transcriber',
};

export default function TranscriberLayout({ children }: { children: ReactNode }) {
  return children;
}
