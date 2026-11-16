'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Route } from 'next';
import { BrandMark } from '@/components/BrandMark';
import { cx } from '@/components/ui/controls';
import { useSessionUser } from '@/hooks/useSessionUser';
import { detectOS } from '@/lib/platform';

/**
 * The torus mark in the top-left corner of every page. It opens a menu with
 * the torus apps and the account links (sign in, or profile, settings, and
 * sign out). Open it with a click or Cmd/Ctrl+K. Close it with Esc or a click
 * outside.
 */

interface AppEntry {
  /** Null for an app that is announced but not built yet. */
  href: Route | null;
  name: string;
  hint: string;
}

const APPS: AppEntry[] = [
  { href: '/' as Route, name: 'Visualizer', hint: 'Turn audio into 3D visuals' },
  { href: '/conductor' as Route, name: 'Conductor', hint: 'Sketch music with a SoundFont DAW' },
  { href: '/transcriber' as Route, name: 'Transcriber', hint: 'Convert audio to MIDI' },
  { href: null, name: 'Stem separation', hint: 'Split a track into stems. Not built yet' },
];

const itemClass =
  'block rounded-md px-3 py-2 text-left text-[13px] text-torus-fg-dim transition-colors hover:bg-torus-raised hover:text-torus-fg';

export function AppLauncher() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { user, loaded, refresh } = useSessionUser();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Move focus into the menu when it opens, and back to the button when it closes.
  useEffect(() => {
    if (open) {
      panelRef.current?.focus();
    } else if (document.activeElement && rootRef.current?.contains(document.activeElement)) {
      triggerRef.current?.focus();
    }
  }, [open]);

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

  // The Discord sign-in popup posts this message when it finishes.
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

  const shortcut = detectOS() === 'mac' ? 'Cmd+K' : 'Ctrl+K';
  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className="fixed left-3 top-2.5 z-40">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Open the torus menu (${shortcut})`}
        aria-expanded={open}
        title={`torus menu (${shortcut})`}
        className={cx(
          'grid h-9 w-9 place-items-center rounded-full border bg-torus-panel transition-colors',
          open
            ? 'border-torus-border-strong'
            : 'border-torus-border hover:border-torus-border-strong',
        )}
      >
        <BrandMark size={20} sparkle={false} />
      </button>

      {open ? (
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-label="torus apps and account"
          className="absolute left-0 mt-2 w-72 rounded-md border border-torus-border-strong bg-torus-panel outline-none"
        >
          <p className="flex items-center justify-between border-b border-torus-border px-4 py-2.5 text-xs text-torus-fg-faint">
            <span>Apps</span>
            <span>{shortcut}</span>
          </p>
          <ul className="p-1.5">
            {APPS.map((app) => {
              const active = isActive(app.href);
              const body = (
                <>
                  <span className="flex items-center justify-between gap-2 font-medium text-torus-fg">
                    {app.name}
                    {active ? (
                      <span className="text-[11px] font-normal text-torus-mid">You are here</span>
                    ) : null}
                  </span>
                  <span className="block text-[11px] text-torus-fg-faint">{app.hint}</span>
                </>
              );
              return (
                <li key={app.name}>
                  {app.href === null ? (
                    <div className="px-3 py-2 text-[13px] opacity-60" aria-disabled="true">
                      {body}
                    </div>
                  ) : (
                    <Link
                      href={app.href}
                      aria-current={active ? 'page' : undefined}
                      className={cx(itemClass, active && 'bg-torus-raised')}
                    >
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="border-t border-torus-border p-1.5">
            {!loaded ? (
              <p className="px-3 py-2 text-[11px] text-torus-fg-faint">Checking sign-in</p>
            ) : !user ? (
              <Link href="/signin" className={itemClass} onClick={close}>
                <span className="font-medium text-torus-fg">Sign in</span>
                <span className="block text-[11px] text-torus-fg-faint">
                  Optional. An account gives you a handle and a profile.
                </span>
              </Link>
            ) : (
              <>
                <div className="flex items-center gap-3 px-3 py-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full border border-torus-border bg-torus-bg text-xs text-torus-fg-dim">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span>{user.handle.charAt(0).toUpperCase()}</span>
                    )}
                  </span>
                  <span className="min-w-0 truncate text-[13px] font-medium text-torus-fg">
                    @{user.handle}
                  </span>
                </div>
                <Link
                  href={`/u/${encodeURIComponent(user.handle)}` as Route}
                  className={itemClass}
                  onClick={close}
                >
                  Profile
                </Link>
                <Link href={'/settings' as Route} className={itemClass} onClick={close}>
                  Settings
                </Link>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className={cx(itemClass, 'w-full')}
                >
                  Sign out
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-4 border-t border-torus-border px-4 py-2.5 text-[11px] text-torus-fg-faint">
            <Link href={'/about' as Route} className="hover:text-torus-fg" onClick={close}>
              About
            </Link>
            <Link href={'/principles' as Route} className="hover:text-torus-fg" onClick={close}>
              Principles
            </Link>
            <Link href={'/privacy' as Route} className="hover:text-torus-fg" onClick={close}>
              Privacy
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
