'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Route } from 'next';

/**
 * AppLauncher — the out-of-the-way connector for the torus.wtf "constellation".
 *
 * A small fixed glyph in the corner that opens a command-palette overlay
 * listing every torus app. Summon with a click or Cmd/Ctrl+K, dismiss with
 * Esc / backdrop. Lives in the shared (studio) layout so it rides along on
 * the visualizer and Conductor without either app having to know about it.
 */

interface AppEntry {
  href: Route;
  name: string;
  glyph: string;
  hint: string;
}

const APPS: AppEntry[] = [
  { href: '/' as Route, name: 'Visualizer', glyph: '\u25ce', hint: 'Turn any audio into 3D visuals' },
  { href: '/conductor' as Route, name: 'Conductor', glyph: '\u25a6', hint: 'SoundFont DAW \u2014 compose music' },
  { href: '/transcriber' as Route, name: 'Transcriber', glyph: '\u266b', hint: 'Audio \u2192 MIDI, in your browser' },
];

export function AppLauncher() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  // Render nothing during SSR/first paint so the overlay chrome can never cause
  // a hydration mismatch with the static visualizer page it rides on top of.
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

  // Close whenever navigation completes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (open) firstLinkRef.current?.focus();
  }, [open]);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  if (!mounted) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open torus apps (Cmd+K)"
        title="torus apps (\u2318K)"
        className="fixed bottom-4 left-4 z-50 grid h-10 w-10 place-items-center rounded-full border border-torus-border bg-torus-bg/70 text-lg text-torus-fg-dim backdrop-blur-sm transition-opacity hover:text-torus-fg hover:border-torus-border-strong opacity-50 hover:opacity-100"
      >
        {'\u25ce'}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="torus apps"
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[18vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-torus-border-strong bg-torus-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-torus-border px-4 py-3">
              <span className="text-sm font-medium text-torus-fg-dim">torus apps</span>
              <span className="text-[10px] text-torus-fg-faint">{'\u2318'}K to toggle</span>
            </div>
            <ul className="p-2">
              {APPS.map((app, i) => {
                const active = isActive(app.href);
                return (
                  <li key={app.href}>
                    <Link
                      ref={i === 0 ? firstLinkRef : undefined}
                      href={app.href}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                        active
                          ? 'bg-torus-mid/10 text-torus-fg'
                          : 'text-torus-fg-dim hover:bg-white/5 hover:text-torus-fg'
                      }`}
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-torus-border bg-torus-bg text-lg">
                        {app.glyph}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="text-sm font-medium">{app.name}</span>
                        <span className="truncate text-[11px] text-torus-fg-faint">{app.hint}</span>
                      </span>
                      {active ? (
                        <span className="ml-auto text-[10px] text-torus-mid">current</span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
