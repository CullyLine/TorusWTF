'use client';

import Link from 'next/link';
import { FeedbackButton } from '@/components/FeedbackButton';

interface TopBarProps {
  /** The app this page belongs to, shown after the torus wordmark. */
  app: 'visualizer' | 'conductor' | 'transcriber';
  /** Opens the app's shortcut list. Apps without one leave this out. */
  onOpenShortcuts?: () => void;
}

const linkClass =
  'rounded-md px-2.5 py-1.5 text-[13px] text-torus-fg-dim hover:bg-torus-raised hover:text-torus-fg';

/**
 * The bar across the top of an app page. The app launcher is fixed to the
 * top-left corner of every page, so the bar leaves room for it on the left.
 */
export function TopBar({ app, onOpenShortcuts }: TopBarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-torus-border bg-torus-panel pl-[3.75rem] pr-2">
      <h1 className="text-sm font-semibold tracking-tight text-torus-fg">
        torus <span className="font-normal text-torus-fg-faint">{app}</span>
      </h1>
      <nav aria-label="Help" className="flex items-center gap-1">
        {onOpenShortcuts ? (
          <button
            type="button"
            onClick={onOpenShortcuts}
            title="Keyboard shortcuts (?)"
            className={linkClass}
          >
            Shortcuts
          </button>
        ) : null}
        <FeedbackButton className={linkClass} />
        <Link href="/about" className={linkClass}>
          About
        </Link>
      </nav>
    </header>
  );
}
