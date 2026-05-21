'use client';

import { Logo } from '@torus/ui';
import { AuthNav } from './AuthNav';
import { UploadButton } from './UploadButton';
import { SearchBox } from './SearchBox';

interface SiteHeaderProps {
  logoSize?: number;
  initialUser?: { handle: string } | null;
}

export function SiteHeader({ logoSize = 32, initialUser = null }: SiteHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4">
      <Logo size={logoSize} wordmark className="text-torus-fg shrink-0" />
      <div className="flex items-center gap-2">
        <SearchBox />
        <UploadButton variant="pill" label="upload (U)" />
        <AuthNav initialUser={initialUser} />
      </div>
    </header>
  );
}
