'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { SUPPORT_EMAIL } from '@/lib/constants';

type FeedbackCategory = 'bug' | 'feature' | 'other';

const MAX_CHARS = 5000;

interface FeedbackDialogProps {
  open: boolean;
  onClose: () => void;
}

export function FeedbackDialog({ open, onClose }: FeedbackDialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = panelRef.current?.querySelector<HTMLElement>(
      'button, [href], input, [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const firstEl = focusable[0]!;
        const lastEl = focusable[focusable.length - 1]!;
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previousFocus.current?.focus();
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open) return;
    setTitle('');
    setBody('');
    setCategory('bug');
    setBusy(false);
    setError(null);
    setSent(false);
  }, [open]);

  if (!open) return null;

  const remaining = MAX_CHARS - body.length;

  const submit = async () => {
    if (body.trim().length === 0 && title.trim().length === 0) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          title: title.trim() || 'Visualizer feedback',
          body: body.trim(),
          category,
          pageUrl: window.location.href,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Could not send feedback.');
        return;
      }
      setSent(true);
      window.setTimeout(onClose, 1800);
    } catch {
      setError('Network error. Try again or email support directly.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Close feedback dialog"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-lg rounded-xl border border-torus-border bg-torus-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-torus-fg">
          Send feedback
        </h2>
        <p className="mt-1 text-xs text-torus-fg-faint">
          Goes straight to our inbox. If you&apos;re signed in, we&apos;ll include your account email
          so we can reply.
        </p>

        {sent ? (
          <p className="mt-6 text-sm text-torus-high">Thanks — we got it.</p>
        ) : (
          <>
            <div className="mt-4 space-y-3">
              <label className="block text-xs text-torus-fg-dim">
                Title
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Short summary"
                  className="mt-1 w-full rounded-lg border border-torus-border bg-torus-bg px-3 py-2 text-sm text-torus-fg"
                />
              </label>

              <fieldset className="text-xs text-torus-fg-dim">
                <legend className="mb-1">Category</legend>
                <div className="flex flex-wrap gap-3">
                  {(
                    [
                      ['bug', 'Bug'],
                      ['feature', 'Feature'],
                      ['other', 'Other'],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={value} className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="feedback-category"
                        value={value}
                        checked={category === value}
                        onChange={() => setCategory(value)}
                        className="accent-torus-mid"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="block text-xs text-torus-fg-dim">
                <div className="mb-1 flex justify-between">
                  <span>Details</span>
                  <span className={remaining < 0 ? 'text-torus-bass' : 'text-torus-fg-faint'}>
                    {remaining} left
                  </span>
                </div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value.slice(0, MAX_CHARS))}
                  rows={8}
                  placeholder="Describe the bug or feature request..."
                  className="w-full resize-y rounded-lg border border-torus-border bg-torus-bg px-3 py-2 text-sm text-torus-fg"
                />
              </label>
            </div>

            {error ? <p className="mt-3 text-sm text-torus-bass">{error}</p> : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-torus-border px-4 py-2 text-sm text-torus-fg-dim hover:border-torus-mid/40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={
                  busy || (body.trim().length === 0 && title.trim().length === 0)
                }
                className="rounded-lg bg-torus-mid px-4 py-2 text-sm font-medium text-torus-bg disabled:opacity-40"
              >
                {busy ? 'Sending…' : 'Send feedback'}
              </button>
            </div>
          </>
        )}

        <p className="mt-4 text-[10px] text-torus-fg-faint">
          Or email{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-torus-mid underline">
            {SUPPORT_EMAIL}
          </a>{' '}
          directly.
        </p>
      </div>
    </div>
  );
}
