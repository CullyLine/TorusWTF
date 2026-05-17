'use client';

import { useState, type FormEvent } from 'react';

interface SignInFormProps {
  initialSent: boolean;
  initialError: string | null;
}

export function SignInForm({ initialSent, initialError }: SignInFormProps) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(initialSent);
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/magic', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Sign-in failed (${res.status})`);
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-torus-border-strong bg-torus-surface p-5 text-center text-sm text-torus-fg-dim"
      >
        Check your inbox — if {email || 'your email'} is registered, a sign-in link is on the way.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label htmlFor="signin-email" className="text-xs uppercase tracking-wider text-torus-fg-dim">
        email
      </label>
      <input
        id="signin-email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-full border border-torus-border-strong bg-transparent px-5 py-3 text-sm text-torus-fg outline-none focus:border-torus-mid"
        placeholder="you@example.com"
        disabled={busy}
      />
      <button
        type="submit"
        disabled={busy || !email}
        className="rounded-full bg-torus-fg px-5 py-3 text-sm font-medium text-torus-bg transition disabled:opacity-50"
      >
        {busy ? 'sending…' : 'send sign-in link'}
      </button>
      {error ? (
        <div role="alert" className="text-sm text-torus-bass">
          {error}
        </div>
      ) : null}
    </form>
  );
}
