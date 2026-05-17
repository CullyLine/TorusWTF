'use client';

import { useState, type FormEvent } from 'react';

const REASONS = [
  { value: 'spam', label: 'Spam / promotion' },
  { value: 'copyright', label: 'Copyright violation' },
  { value: 'illegal', label: 'Illegal content' },
  { value: 'harassment', label: 'Harassment / hate' },
  { value: 'other', label: 'Other' },
] as const;

export function ReportForm({ shareCode }: { shareCode: string }) {
  const [reason, setReason] = useState<(typeof REASONS)[number]['value']>('spam');
  const [body, setBody] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ shareCode, reason, body: body.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Report failed (${res.status})`);
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Report failed.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-torus-border-strong bg-torus-surface p-5 text-sm text-torus-fg-dim">
        Thanks — your report was received and will be reviewed.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs uppercase tracking-wider text-torus-fg-dim">reason</legend>
        {REASONS.map((r) => (
          <label key={r.value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="reason"
              value={r.value}
              checked={reason === r.value}
              onChange={() => setReason(r.value)}
              className="accent-torus-mid"
            />
            {r.label}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-wider text-torus-fg-dim">
          details (optional)
        </span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={4}
          className="rounded-xl border border-torus-border-strong bg-transparent p-3 text-sm text-torus-fg outline-none focus:border-torus-mid"
          placeholder="Anything that would help a moderator triage faster."
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-torus-fg px-5 py-3 text-sm font-medium text-torus-bg disabled:opacity-50"
      >
        {busy ? 'sending…' : 'submit report'}
      </button>
      {error ? (
        <div role="alert" className="text-sm text-torus-bass">
          {error}
        </div>
      ) : null}
    </form>
  );
}
