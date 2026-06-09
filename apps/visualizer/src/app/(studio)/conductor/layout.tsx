import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Conductor',
};

export default function ConductorLayout({ children }: { children: ReactNode }) {
  return children;
}
