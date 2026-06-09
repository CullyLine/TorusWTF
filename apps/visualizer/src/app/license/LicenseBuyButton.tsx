'use client';

import { useState } from 'react';

export function LicenseBuyButton({ configured }: { configured: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/license/checkout', {
        method: 'POST',
        credentials: 'same-origin',
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? 'Could not start checkout.');
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Network error.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => void buy()}
        disabled={busy || !configured}
        className="rounded-full bg-torus-fg px-6 py-3 text-sm font-medium text-torus-bg transition disabled:opacity-50"
      >
        {busy ? 'Starting checkout…' : 'Get the Production License — $10'}
      </button>
      {!configured ? (
        <p className="text-xs text-torus-fg-faint">Checkout isn’t live on this instance yet.</p>
      ) : null}
      {error ? <p className="text-sm text-torus-bass">{error}</p> : null}
    </div>
  );
}
