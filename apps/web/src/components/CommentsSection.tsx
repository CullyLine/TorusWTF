'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSessionUser } from '@/hooks/useSessionUser';

interface CommentAuthor {
  handle: string;
  avatarUrl: string | null;
  tier: string;
}

interface CommentRow {
  id: string;
  body: string;
  createdAt: number;
  author: CommentAuthor;
}

const MAX_BODY = 800;

export function CommentsSection({ shareCode }: { shareCode: string }) {
  const { user } = useSessionUser();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/clips/${shareCode}/comments`, { credentials: 'same-origin' });
      if (!res.ok) return;
      const data = (await res.json()) as { comments: CommentRow[] };
      setComments(data.comments ?? []);
    } finally {
      setLoaded(true);
    }
  }, [shareCode]);

  useEffect(() => {
    void load();
  }, [load]);

  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || text.length > MAX_BODY || !user) return;
    setPosting(true);
    setError(null);
    const optimistic: CommentRow = {
      id: `opt-${Date.now()}`,
      body: text,
      createdAt: Date.now(),
      author: { handle: user.handle, avatarUrl: null, tier: 'free' },
    };
    setComments((c) => [optimistic, ...c]);
    setBody('');
    try {
      const res = await fetch(`/api/clips/${shareCode}/comments`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: text }),
      });
      const data = (await res.json()) as CommentRow & { error?: string };
      if (!res.ok) {
        setComments((c) => c.filter((x) => x.id !== optimistic.id));
        setError(data.error ?? 'Could not post comment.');
        setBody(text);
        return;
      }
      setComments((c) =>
        c.map((x) =>
          x.id === optimistic.id
            ? {
                id: data.id,
                body: data.body,
                createdAt: data.createdAt,
                author: data.author,
              }
            : x,
        ),
      );
    } catch {
      setComments((c) => c.filter((x) => x.id !== optimistic.id));
      setError('Network error.');
      setBody(text);
    } finally {
      setPosting(false);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">comments</h2>
      {!loaded ? (
        <p className="mt-4 text-sm text-torus-fg-faint">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="mt-4 text-sm text-torus-fg-dim">No comments yet.</p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-torus-border">
          {comments.map((c) => (
            <li key={c.id} className="py-4">
              <div className="flex items-baseline gap-2 text-xs text-torus-fg-faint">
                <span className="font-medium text-torus-fg">
                  @{c.author.handle}
                  {c.author.tier === 'supporter' ? (
                    <span className="ml-1 text-torus-mid" title="Supporter">
                      ★
                    </span>
                  ) : null}
                </span>
                <time dateTime={new Date(c.createdAt).toISOString()}>
                  {formatRelative(c.createdAt)}
                </time>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-torus-fg-dim">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      {user ? (
        <form onSubmit={(e) => void postComment(e)} className="mt-6">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={MAX_BODY}
            rows={3}
            placeholder="Add a comment…"
            className="w-full rounded-lg border border-torus-border-strong bg-torus-surface px-3 py-2 text-sm"
          />
          <div className="mt-2 flex items-center justify-between gap-4">
            <span className="text-xs text-torus-fg-faint">
              {body.length}/{MAX_BODY}
            </span>
            {error ? <span className="text-xs text-torus-bass">{error}</span> : null}
            <button
              type="submit"
              disabled={posting || !body.trim() || body.length > MAX_BODY}
              className="rounded-full bg-torus-fg px-4 py-2 text-xs font-medium text-torus-bg disabled:opacity-50"
            >
              {posting ? 'Posting…' : 'Post'}
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-6 text-sm text-torus-fg-dim">
          <Link href="/signin" className="text-torus-mid underline">
            Sign in
          </Link>{' '}
          to comment.
        </p>
      )}
    </section>
  );
}

function formatRelative(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}
