'use client';

import { useEffect, useId, useRef } from 'react';

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
  hasFileSource: boolean;
}

// `needsFile` rows only apply while an audio file is loaded.
const SHORTCUTS = [
  { keys: 'Space', action: 'Play or pause', needsFile: true },
  { keys: '← / →', action: 'Skip 5 seconds', needsFile: true },
  { keys: 'Shift + ← / →', action: 'Skip 15 seconds', needsFile: true },
  { keys: 'F', action: 'Fullscreen', needsFile: false },
  { keys: 'H', action: 'Show or hide the controls', needsFile: false },
  { keys: 'R', action: 'Random visualizer', needsFile: false },
  { keys: '?', action: 'Show this list', needsFile: false },
] as const;

export function ShortcutsModal({ open, onClose, hasFileSource }: ShortcutsModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = panelRef.current?.querySelector<HTMLElement>(
      'button, [href], input, [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const firstEl = focusable[0]!;
        const lastEl = focusable[focusable.length - 1]!;
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previousFocus.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const rows = SHORTCUTS.filter((row) => hasFileSource || !row.needsFile);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-md border border-torus-border-strong bg-torus-panel p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-sm font-semibold text-torus-fg">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-torus-border-strong px-2.5 py-1 text-xs text-torus-fg hover:bg-torus-raised"
          >
            Close
          </button>
        </div>
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.keys} className="flex items-center justify-between gap-4 text-xs">
              <kbd className="rounded border border-torus-border bg-torus-raised px-2 py-0.5 font-sans text-torus-fg">
                {row.keys}
              </kbd>
              <span className="text-right text-torus-fg-dim">{row.action}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
