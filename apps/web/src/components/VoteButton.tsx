'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSessionUser } from '@/hooks/useSessionUser';

interface VoteButtonProps {
  shareCode: string;
  initialCount?: number;
  initialHasVoted?: boolean;
}

export function VoteButton({
  shareCode,
  initialCount = 0,
  initialHasVoted = false,
}: VoteButtonProps) {
  const { user, loaded } = useSessionUser();
  const [count, setCount] = useState(initialCount);
  const [hasVoted, setHasVoted] = useState(initialHasVoted);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/clips/${shareCode}/vote`, { credentials: 'same-origin' });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { count?: number; hasVoted?: boolean };
        if (!cancelled) {
          setCount(data.count ?? 0);
          setHasVoted(Boolean(data.hasVoted));
        }
      } catch {
        // keep SSR hints
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shareCode]);

  const toggle = useCallback(async () => {
    if (!user || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/clips/${shareCode}/vote`, {
        method: hasVoted ? 'DELETE' : 'POST',
        credentials: 'same-origin',
      });
      if (!res.ok) return;
      const data = (await res.json()) as { count?: number };
      if (typeof data.count === 'number') {
        setCount(data.count);
      } else if (hasVoted) {
        setCount((c) => Math.max(0, c - 1));
      } else {
        setCount((c) => c + 1);
      }
      setHasVoted(!hasVoted);
    } finally {
      setBusy(false);
    }
  }, [user, busy, shareCode, hasVoted]);

  const disabled = !user || busy;
  const title = !loaded
    ? undefined
    : user
      ? hasVoted
        ? 'Remove your vote this week'
        : 'Vote for this clip this week'
      : 'Sign in to vote';

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={disabled}
      title={title}
      className={`rounded-full border px-3 py-1.5 font-mono text-xs transition ${
        hasVoted
          ? 'border-torus-mid bg-torus-mid/10 text-torus-mid'
          : 'border-torus-border-strong text-torus-fg-dim hover:bg-torus-surface'
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {hasVoted ? '♥' : '♡'} {count}
    </button>
  );
}
