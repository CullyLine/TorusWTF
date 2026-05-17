'use client';

import { useState, type FormEvent } from 'react';
import type { User } from '@torus/db';

interface Props {
  currentUser: User | null;
}

export function SupporterPanel({ currentUser }: Props) {
  if (!currentUser) {
    return (
      <a
        href="/signin"
        className="inline-block rounded-full bg-torus-fg px-5 py-3 text-sm font-medium text-torus-bg"
      >
        sign in to support
      </a>
    );
  }
  if (currentUser.tier === 'supporter') {
    return <SubdomainEditor initial={currentUser.customSubdomain ?? ''} />;
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <a
        href="/api/billing/polar/checkout?plan=monthly"
        className="rounded-full bg-torus-fg px-5 py-3 text-sm font-medium text-torus-bg"
      >
        support · $3/mo
      </a>
      <a
        href="/api/billing/polar/checkout?plan=annual"
        className="rounded-full border border-torus-border-strong px-5 py-3 text-sm text-torus-fg hover:bg-torus-surface"
      >
        support · $30/yr
      </a>
    </div>
  );
}

function SubdomainEditor({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(initial || null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const cleaned = value.trim().toLowerCase();
      const res = await fetch('/api/me/subdomain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subdomain: cleaned || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Save failed.');
      }
      setSaved(cleaned || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <p className="text-sm text-torus-mid">★ You’re a supporter. Thank you.</p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={32}
          placeholder="yourname"
          className="rounded-full border border-torus-border-strong bg-transparent px-4 py-2 font-mono text-sm text-torus-fg outline-none focus:border-torus-mid"
        />
        <span className="font-mono text-torus-fg-dim">.torus.fm</span>
      </label>
      <button
        type="submit"
        disabled={busy}
        className="self-start rounded-full bg-torus-fg px-5 py-2 text-sm font-medium text-torus-bg disabled:opacity-50"
      >
        {busy ? 'saving…' : 'save subdomain'}
      </button>
      {error ? <p className="text-xs text-torus-bass">{error}</p> : null}
      {saved ? (
        <p className="text-xs text-torus-fg-dim">
          Live at <span className="font-mono">{saved}.torus.fm</span>.
        </p>
      ) : null}
    </form>
  );
}
