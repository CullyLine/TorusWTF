'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSessionUser } from '@/hooks/useSessionUser';

/**
 * Top-right account control. Signed out → a quiet "sign in" pill. Signed in →
 * an avatar button that opens a small menu (profile, settings, license, sign
 * out). A licensed account gets a gold sparkle on the avatar.
 */
export function AccountMenu() {
  const { user, loaded, refresh } = useSessionUser();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'torus-auth-success') void refresh();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(
      () => undefined,
    );
    setOpen(false);
    await refresh();
  }

  const pill =
    'rounded-full border border-torus-border bg-torus-bg/70 px-4 py-2 text-xs text-torus-fg-dim backdrop-blur-sm transition hover:text-torus-fg hover:border-torus-border-strong';

  if (!loaded) {
    return <div className="fixed right-4 top-4 z-40 h-9 w-9" aria-hidden />;
  }

  if (!user) {
    return (
      <Link href="/signin" className={`fixed right-4 top-4 z-40 ${pill}`}>
        sign in
      </Link>
    );
  }

  const initial = user.handle.charAt(0).toUpperCase();

  return (
    <div ref={rootRef} className="fixed right-4 top-4 z-40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-torus-border bg-torus-bg/70 text-sm text-torus-fg-dim backdrop-blur-sm transition hover:border-torus-border-strong hover:text-torus-fg"
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span>{initial}</span>
        )}
        {user.hasLicense ? (
          <span
            className="absolute -right-0.5 -top-0.5 text-[10px] text-torus-high drop-shadow"
            title="Production License"
            aria-hidden
          >
            ✦
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-torus-border-strong bg-torus-bg/95 shadow-2xl backdrop-blur-sm"
        >
          <div className="border-b border-torus-border px-4 py-3">
            <div className="truncate text-sm font-medium text-torus-fg">@{user.handle}</div>
            <div className="mt-0.5 text-[11px] text-torus-fg-faint">
              {user.hasLicense ? 'Production License ✦' : 'Free account'}
            </div>
          </div>
          <nav className="flex flex-col p-1 text-sm">
            <Link
              href={`/u/${encodeURIComponent(user.handle)}`}
              role="menuitem"
              className="rounded-lg px-3 py-2 text-torus-fg-dim transition hover:bg-white/5 hover:text-torus-fg"
              onClick={() => setOpen(false)}
            >
              Profile
            </Link>
            <Link
              href="/settings"
              role="menuitem"
              className="rounded-lg px-3 py-2 text-torus-fg-dim transition hover:bg-white/5 hover:text-torus-fg"
              onClick={() => setOpen(false)}
            >
              Settings
            </Link>
            {!user.hasLicense ? (
              <Link
                href="/license"
                role="menuitem"
                className="rounded-lg px-3 py-2 text-torus-high transition hover:bg-white/5"
                onClick={() => setOpen(false)}
              >
                Get Production License
              </Link>
            ) : null}
            <button
              type="button"
              role="menuitem"
              onClick={() => void signOut()}
              className="rounded-lg px-3 py-2 text-left text-torus-fg-dim transition hover:bg-white/5 hover:text-torus-fg"
            >
              Sign out
            </button>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
