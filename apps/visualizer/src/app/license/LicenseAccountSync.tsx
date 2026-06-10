'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionUser } from '@/hooks/useSessionUser';

function notifyLicenseGranted() {
  window.dispatchEvent(new CustomEvent('torus-license-granted'));
}

async function activateLicense(checkoutId?: string): Promise<boolean> {
  const res = await fetch('/api/license/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(checkoutId ? { checkoutId } : {}),
  });
  const data = (await res.json().catch(() => ({}))) as { granted?: boolean };
  return Boolean(data.granted);
}

/** Try to bind a Polar purchase to the signed-in account (webhook fallback). */
export function LicenseAccountSync() {
  const router = useRouter();
  const { refresh } = useSessionUser();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const granted = await activateLicense();
      if (cancelled || !granted) return;
      await refresh();
      notifyLicenseGranted();
      router.refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [refresh, router]);

  return null;
}

interface LicensePostCheckoutProps {
  checkoutId?: string;
}

export function LicensePostCheckout({ checkoutId }: LicensePostCheckoutProps) {
  const router = useRouter();
  const { refresh } = useSessionUser();

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 15;

    const tick = async () => {
      if (cancelled || attempts >= maxAttempts) return;
      attempts += 1;

      const granted = await activateLicense(checkoutId);
      if (granted) {
        await refresh();
        notifyLicenseGranted();
        router.refresh();
        return;
      }

      window.setTimeout(() => void tick(), 2000);
    };

    void tick();

    return () => {
      cancelled = true;
    };
  }, [checkoutId, refresh, router]);

  return (
    <div className="rounded-2xl border border-torus-mid/40 bg-torus-surface p-5 text-sm">
      <p className="font-medium text-torus-fg">Thanks for your purchase ✦</p>
      <p className="mt-1 text-torus-fg-dim">
        Activating your license on this account… If it takes more than a moment, tap refresh below
        or email{' '}
        <a href="mailto:support@torus.wtf" className="text-torus-mid underline">
          support@torus.wtf
        </a>
        .
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => {
            void (async () => {
              const granted = await activateLicense(checkoutId);
              if (granted) {
                await refresh();
                notifyLicenseGranted();
              }
              router.refresh();
            })();
          }}
          className="rounded-full border border-torus-border-strong px-4 py-2 text-xs font-medium text-torus-fg hover:bg-torus-surface"
        >
          Refresh status
        </button>
        <a
          href="/"
          className="rounded-full bg-torus-fg px-4 py-2 text-xs font-medium text-torus-bg"
        >
          Back to the visualizer
        </a>
      </div>
    </div>
  );
}
