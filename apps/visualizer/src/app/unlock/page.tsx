'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@torus/ui';
import { useUnlock } from '@/hooks/useUnlock';

const checkoutUrl = process.env.NEXT_PUBLIC_POLAR_CHECKOUT_URL;

export default function UnlockPage() {
  const router = useRouter();
  const { activate } = useUnlock();
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await activate(key);
    setLoading(false);
    if (result.ok) {
      router.push('/');
      return;
    }
    setError(result.reason ?? 'Invalid license key.');
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-12">
      <Logo size={40} wordmark href="/" color="var(--color-torus-mid)" />
      <h1 className="mt-6 text-2xl font-semibold">Unlock torus visualizer</h1>
      <p className="mt-2 text-sm text-torus-fg-dim">
        $10 one-time — up to 4K / 240 FPS exports, no watermark, custom palette, saved presets, and
        all future presets free.
      </p>

      {checkoutUrl ? (
        <a
          href={checkoutUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex justify-center rounded-full bg-torus-mid/20 px-5 py-2.5 text-sm font-medium text-torus-mid border border-torus-mid/40"
        >
          Buy full version — $10
        </a>
      ) : (
        <p className="mt-6 text-xs text-torus-fg-faint">
          Checkout URL not configured. Set NEXT_PUBLIC_POLAR_CHECKOUT_URL in .env.
        </p>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-8 space-y-4">
        <label className="block text-sm text-torus-fg-dim">
          Paste your license key
          <input
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="XXXX-XXXX-XXXX"
            className="mt-2 w-full rounded-lg border border-torus-border bg-torus-bg px-3 py-2 text-sm text-torus-fg"
            autoComplete="off"
          />
        </label>
        {error ? <p className="text-xs text-torus-bass">{error}</p> : null}
        <button
          type="submit"
          disabled={loading || !key.trim()}
          className="w-full rounded-full bg-torus-mid/20 py-2.5 text-sm font-medium text-torus-mid border border-torus-mid/40 disabled:opacity-40"
        >
          {loading ? 'Verifying…' : 'Activate'}
        </button>
      </form>

      <p className="mt-6 text-xs text-torus-fg-faint">
        Lost your key? Check your purchase email.{' '}
        <Link href="/" className="text-torus-mid hover:underline">
          Back to visualizer
        </Link>
      </p>
    </div>
  );
}
