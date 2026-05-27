'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { githubIssueUrl } from '@/lib/constants';

type FeedbackCategory = 'bug' | 'feature' | 'other';

const MAX_CHARS = 5000;

interface FeedbackDialogProps {
  open: boolean;
  onClose: () => void;
}

export function FeedbackDialog({ open, onClose }: FeedbackDialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<FeedbackCategory>('feature');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) return;
    setTitle('');
    setBody('');
    setCategory('feature');
  }, [open]);

  if (!open) return null;

  const remaining = MAX_CHARS - body.length;

  const submit = () => {
    const trimmedTitle = title.trim() || 'Visualizer feedback';
    const url = githubIssueUrl({
      title: trimmedTitle,
      body: body.trim() || '_No details provided._',
      label: category,
    });
    window.open(url, '_blank', 'noopener,noreferrer');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
      >
        <h2 id={titleId} className="text-lg font-semibold text-torus-fg">
          Send feedback
        </h2>
        <p className="mt-1 text-xs text-torus-fg-faint">
          Opens a pre-filled GitHub issue. Markdown supported in the body.
        </p>

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

          <p className="text-[10px] text-torus-fg-faint">
            Markdown: **bold**, *italic*, `code`, - lists
          </p>
        </div>

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
            onClick={submit}
            disabled={body.trim().length === 0 && title.trim().length === 0}
            className="rounded-lg bg-torus-mid px-4 py-2 text-sm font-medium text-torus-bg disabled:opacity-40"
          >
            Open GitHub issue
          </button>
        </div>
      </div>
    </div>
  );
}
