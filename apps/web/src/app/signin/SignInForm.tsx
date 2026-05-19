'use client';

import { useState, type FormEvent } from 'react';
import { MagicLinkSentNotice, type DevMailInfo } from '@torus/ui';

interface SignInFormProps {
  initialSent: boolean;
  initialError: string | null;
}

interface MagicApiResponse {
  message?: string;
  devMail?: DevMailInfo;
}

export function SignInForm({ initialSent, initialError }: SignInFormProps) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(initialSent);
  const [devMail, setDevMail] = useState<DevMailInfo | undefined>(undefined);
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
      const data = (await res.json().catch(() => ({}))) as MagicApiResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? `Sign-in failed (${res.status})`);
      }
      setDevMail(data.devMail);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-torus-border-strong bg-torus-surface p-5">
        <MagicLinkSentNotice email={email} devMail={devMail} />
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
