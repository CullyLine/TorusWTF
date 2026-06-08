'use client';

import Link from 'next/link';

export function UnlockBanner() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex h-12 items-center justify-center border-t border-torus-border bg-torus-bg/95 backdrop-blur-sm">
      <p className="text-sm text-torus-fg-dim">
        Free exports are watermarked and capped —{' '}
        <Link href="/license" className="font-medium text-torus-high hover:underline">
          get the Production License ✦
        </Link>
      </p>
    </div>
  );
}
