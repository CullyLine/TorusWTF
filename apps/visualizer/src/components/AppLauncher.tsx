'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Route } from 'next';
import { BrandMark } from '@/components/BrandMark';

/**
 * AppLauncher — the always-present, out-of-the-way connector for the torus
 * "constellation". A small donut glyph pinned to the top-left of every page
 * that expands into an accordion of the torus apps. Summon with a click or
 * Cmd/Ctrl+K, dismiss with Esc / outside click. Uninvasive by design.
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

  if (!mounted) return null;

  return (
    <div ref={rootRef} className="fixed left-4 top-4 z-40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Open torus apps (Cmd+K)"
        aria-expanded={open}
        title="torus apps (\u2318K)"
        className={`grid h-9 w-9 place-items-center rounded-full border bg-torus-bg/70 backdrop-blur-sm transition ${
          open
            ? 'border-torus-border-strong opacity-100'
            : 'border-torus-border opacity-70 hover:opacity-100 hover:border-torus-border-strong'
        }`}
      >
        <BrandMark size={20} sparkle={false} />
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
        </div>
      ) : null}
    </div>
  );
}
