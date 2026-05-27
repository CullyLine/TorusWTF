'use client';

import { useState } from 'react';
import { FeedbackDialog } from '@/components/FeedbackDialog';

export function FeedbackButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-torus-border px-3 py-1.5 text-xs text-torus-fg-dim hover:border-torus-mid/40 hover:text-torus-mid"
      >
        Feedback
      </button>
      <FeedbackDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
