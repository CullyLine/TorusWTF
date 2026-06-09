'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Route } from 'next';
import { BrandMark } from '@/components/BrandMark';
import { useSessionUser } from '@/hooks/useSessionUser';

/**
 * AppLauncher — the always-present, out-of-the-way connector for the torus
 * "constellation". A small donut glyph pinned to the top-left of every page
 * that expands into an accordion of the torus apps plus the account controls
 * (sign in, or profile / settings / license / sign out). Summon with a click
 * or Cmd/Ctrl+K, dismiss with Esc / outside click. Uninvasive by design.
 */

interface AppEntry {
  href: Route | null;
  name: string;
  glyph: string;
  hint: string;
  soon?: boolean;
}

const APPS: AppEntry[] = [
  { href: '/' as Route, name: 'Visualizer', glyph: '\u25ce', hint: 'Turn any audio into 3D visuals' },
  {
    href: '/conductor' as Route,
    name: 'Conductor',
    glyph: '\u25a6',
    hint: 'SoundFont DAW \u2014 compose music',
  },
  {
    href: '/transcriber' as Route,
    name: 'Transcriber',
    glyph: '\u266b',
    hint: 'Audio \u2192 MIDI, in your browser',
  },
  {
    href: null,
    name: 'Stem Separation',
    glyph: '\u2261',
    hint: 'Split a track into stems',
    soon: true,
  },
];

export function AppLauncher() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const { user, loaded, refresh } = useSessionUser();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'torus-auth-success') void refresh();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [refresh]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const isActive = (href: string | null) =>
    href === null ? false : href === '/' ? pathname === '/' : pathname.startsWith(href);

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(
      () => undefined,
    );
    setOpen(false);
    await refresh();
  }

  if (!mounted) return null;

  const menuItem =
    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-torus-fg-dim transition-colors hover:bg-white/5 hover:text-torus-fg';

  return (
    <div ref={rootRef} className="fixed left-4 top-4 z-40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Open torus apps (Cmd+K)"
        aria-expanded={open}
        title="torus apps (\u2318K)"
        className={`relative grid h-9 w-9 place-items-center rounded-full border bg-torus-bg/70 backdrop-blur-sm transition ${
          open
            ? 'border-torus-border-strong opacity-100'
            : 'border-torus-border opacity-70 hover:opacity-100 hover:border-torus-border-strong'
        }`}
      >
        <BrandMark size={20} sparkle={false} />
        {loaded && user?.hasLicense ? (
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
        <div className="absolute left-0 mt-2 w-72 overflow-hidden rounded-2xl border border-torus-border-strong bg-torus-bg/95 shadow-2xl backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-torus-border px-4 py-3">
            <span className="text-sm font-medium text-torus-fg-dim">torus apps</span>
            <span className="text-[10px] text-torus-fg-faint">{'\u2318'}K</span>
          </div>
          <ul className="p-2">
            {APPS.map((app) => {
              const active = isActive(app.href);
              const inner = (
                <>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-torus-border bg-torus-bg text-lg">
                    {app.glyph}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {app.name}
                      {app.soon ? (
                        <span className="rounded-full border border-torus-border px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-torus-fg-faint">
                          soon
                        </span>
                      ) : null}
                    </span>
                    <span className="truncate text-[11px] text-torus-fg-faint">{app.hint}</span>
                  </span>
                  {active ? <span className="ml-auto text-[10px] text-torus-mid">current</span> : null}
                </>
              );

              if (app.href === null) {
                return (
                  <li key={app.name}>
                    <div
                      className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-torus-fg-faint opacity-70"
                      aria-disabled
                    >
                      {inner}
                    </div>
                  </li>
                );
              }

              return (
                <li key={app.name}>
                  <Link
                    href={app.href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                      active
                        ? 'bg-torus-mid/10 text-torus-fg'
                        : 'text-torus-fg-dim hover:bg-white/5 hover:text-torus-fg'
                    }`}
                  >
                    {inner}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-torus-border p-2">
            {!loaded ? (
              <div className="px-3 py-2.5 text-[11px] text-torus-fg-faint">{'\u2026'}</div>
            ) : !user ? (
              <Link href="/signin" className={menuItem} onClick={() => setOpen(false)}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-torus-border bg-torus-bg text-lg">
                  {'\u21aa'}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium text-torus-fg">Sign in</span>
                  <span className="truncate text-[11px] text-torus-fg-faint">
                    Save projects & sync your license
                  </span>
                </span>
              </Link>
            ) : (
              <>
                <div className="flex items-center gap-3 px-3 py-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-torus-border bg-torus-bg text-sm text-torus-fg-dim">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span>{user.handle.charAt(0).toUpperCase()}</span>
                    )}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-torus-fg">
                      @{user.handle}
                    </span>
                    <span className="text-[11px] text-torus-fg-faint">
                      {user.hasLicense ? 'Production License \u2726' : 'Free account'}
                    </span>
                  </span>
                </div>
                <Link
                  href={`/u/${encodeURIComponent(user.handle)}` as Route}
                  className={menuItem}
                  onClick={() => setOpen(false)}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-torus-border bg-torus-bg text-lg">
                    {'\u25c9'}
                  </span>
                  <span className="text-sm font-medium">Profile</span>
                </Link>
                <Link
                  href={'/settings' as Route}
                  className={menuItem}
                  onClick={() => setOpen(false)}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-torus-border bg-torus-bg text-lg">
                    {'\u2699'}
                  </span>
                  <span className="text-sm font-medium">Settings</span>
                </Link>
                {!user.hasLicense ? (
                  <Link
                    href={'/license' as Route}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-torus-high transition-colors hover:bg-white/5"
                    onClick={() => setOpen(false)}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-torus-mid/30 bg-torus-bg text-lg">
                      {'\u2726'}
                    </span>
                    <span className="font-medium">Get Production License</span>
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className={`w-full text-left ${menuItem}`}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-torus-border bg-torus-bg text-lg">
                    {'\u23fb'}
                  </span>
                  <span className="text-sm font-medium">Sign out</span>
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
