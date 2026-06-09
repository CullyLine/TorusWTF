'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';

export function LicensePostCheckout() {
  const router = useRouter();

  return (
    <div className="rounded-2xl border border-torus-mid/40 bg-torus-surface p-5 text-sm">
      <p className="font-medium text-torus-fg">Thanks for your purchase ✦</p>
      <p className="mt-1 text-torus-fg-dim">
        Your license activates the moment Polar confirms the order. If it isn&apos;t showing yet,
        give it a moment, then refresh.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => router.refresh()}
          className="rounded-full border border-torus-border-strong px-4 py-2 text-xs font-medium text-torus-fg hover:bg-torus-surface"
        >
          Refresh status
        </button>
        <Link
          href={'/' as Route}
          className="rounded-full bg-torus-fg px-4 py-2 text-xs font-medium text-torus-bg"
        >
          Back to the visualizer
        </Link>
      </div>
    </div>
  );
}
