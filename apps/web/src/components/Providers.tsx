'use client';

import type { ReactNode } from 'react';
import { ToastProvider, UploadDialogProvider } from '@torus/ui';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <UploadDialogProvider>{children}</UploadDialogProvider>
    </ToastProvider>
  );
}
