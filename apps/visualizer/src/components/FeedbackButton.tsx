'use client';

import { useState } from 'react';
import { FeedbackDialog } from '@/components/FeedbackDialog';

export function FeedbackButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        Feedback
      </button>
      <FeedbackDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
