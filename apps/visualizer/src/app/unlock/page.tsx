'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@torus/ui';
import { useUnlock } from '@/hooks/useUnlock';

const TEST_LICENSE_KEY = 'TORUS-WTF-TEST-UNLOCK';
const showTestMode = process.env.NODE_ENV !== 'production';

export default function UnlockPage() {
  const router = useRouter();
  const { activate } = useUnlock();
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const runActivate = async (incoming: string) => {
    setLoading(true);
    setError(null);
    const result = await activate(incoming);
    setLoading(false);
    if (result.ok) {
      router.push('/');
      return;
    }
    setError(result.reason ?? 'Invalid license key.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await runActivate(key);
  };

  const handleTestUnlock = async () => {
    setKey(TEST_LICENSE_KEY);
    await runActivate(TEST_LICENSE_KEY);
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-12">
      <Logo size={40} wordmark href="/" color="var(--color-torus-mid)" />
      <h1 className="mt-6 text-2xl font-semibold">Redeem license key</h1>
      <p className="mt-2 text-sm text-torus-fg-dim">
        Already purchased?{' '}
        <Link href="/signin" className="text-torus-mid underline">
          Sign in
        </Link>{' '}
        — your license attaches to your account automatically.
      </p>
      <p className="mt-2 text-sm text-torus-fg-dim">
        Need to buy?{' '}
        <Link href="/license" className="text-torus-mid underline">
          Get the Production License
        </Link>
        .
      </p>

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-8 space-y-4">
        <label className="block text-sm text-torus-fg-dim">
          License key
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
          className="w-full rounded-full border border-torus-mid/40 bg-torus-mid/20 py-2.5 text-sm font-medium text-torus-mid disabled:opacity-40"
        >
          {loading ? 'Verifying…' : 'Redeem key'}
        </button>
      </form>

      {showTestMode ? (
        <div className="mt-4 rounded-lg border border-torus-border/60 bg-torus-bg/40 p-3">
          <p className="text-[11px] text-torus-fg-faint">
            Testing the pro features without a real license?
          </p>
          <button
            type="button"
            onClick={() => void handleTestUnlock()}
            disabled={loading}
            className="mt-2 w-full rounded-full border border-torus-border bg-transparent py-1.5 text-xs text-torus-fg-dim hover:border-torus-mid/40 hover:text-torus-mid disabled:opacity-40"
          >
            {loading ? 'Activating…' : 'Activate test mode'}
          </button>
        </div>
      ) : null}

      <p className="mt-6 text-xs text-torus-fg-faint">
        Lost your key? Check your purchase email.{' '}
        <Link href="/" className="text-torus-mid hover:underline">
          Back to visualizer
        </Link>
      </p>
    </div>
  );
}
