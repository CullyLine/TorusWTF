'use client';

import Link from 'next/link';

export function UnlockBanner() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex h-12 items-center justify-center border-t border-torus-border bg-torus-bg/95 backdrop-blur-sm">
      <p className="text-sm text-torus-fg-dim">
        Unlock all export quality for $10 —{' '}
        <Link href="/unlock" className="font-medium text-torus-mid hover:underline">
          get the full version →
        </Link>
      </p>
    </div>
  );
}
