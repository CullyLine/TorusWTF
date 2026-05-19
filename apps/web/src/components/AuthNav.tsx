'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

interface SessionUser {
  handle: string;
}

interface AuthNavProps {
  /** SSR hint to avoid a flash of "sign in" on first paint. */
  initialUser?: SessionUser | null;
  className?: string;
}

const linkClass =
  'rounded-full border border-torus-border-strong px-4 py-2 text-xs text-torus-fg-dim hover:bg-torus-surface';

/**
 * Header auth control: sign in when logged out, profile when logged in.
 * Refreshes after Discord popup / magic-link sign-in without a full page reload.
 */
export function AuthNav({ initialUser = null, className }: AuthNavProps) {
  const [user, setUser] = useState<SessionUser | null>(initialUser);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (!res.ok) {
        setUser(null);
        return;
      }
      const data = (await res.json()) as { user: { handle: string } | null };
      setUser(data.user ? { handle: data.user.handle } : null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'torus-auth-success') void refresh();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  if (user) {
    return (
      <Link href={`/u/${encodeURIComponent(user.handle)}`} className={className ?? linkClass}>
        profile
      </Link>
    );
  }

  return (
    <Link href="/signin" className={className ?? linkClass}>
      sign in
    </Link>
  );
}
