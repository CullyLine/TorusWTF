'use client';

import { useEffect, useId, useRef } from 'react';
import { isChromium } from '@/lib/palettes';
import { detectOS } from '@/lib/platform';
import type { DesktopCaptureMode } from '@/hooks/useTabCapture';

interface DesktopAudioGuideProps {
  open: boolean;
  reducedMotion?: boolean;
  onClose: () => void;
  /** User picked a capture mode — open Chrome's share dialog with it. */
  onPick: (mode: DesktopCaptureMode) => void;
}

/**
 * Pre-picker for desktop capture. Chrome's native "Choose what to share"
 * dialog can't be customized, so the simple choice lives here: each button
 * opens the native picker pre-aimed at the right surface via
 * `getDisplayMedia` hints (see `useTabCapture`).
 */
export function DesktopAudioGuide({
  open,
  reducedMotion = false,
  onClose,
  onPick,
}: DesktopAudioGuideProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const os = detectOS();
  const chromium = isChromium();

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
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previousFocus.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const overlayClass = reducedMotion
    ? 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4'
    : 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 transition-opacity duration-200';

  const bigButton =
    'flex w-full flex-col items-start gap-1 rounded-xl border border-torus-border bg-torus-surface p-4 text-left transition hover:border-torus-mid/50 hover:bg-torus-mid/5';

  return (
    <div
      className={overlayClass}
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
        className="w-full max-w-md rounded-xl border border-torus-border bg-torus-bg p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-sm font-semibold text-torus-fg">
            What should torus listen to?
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-torus-border px-3 py-1 text-xs text-torus-fg-dim hover:border-torus-border-strong"
          >
            Close
          </button>
        </div>

        {!chromium ? (
          <p className="text-sm text-torus-fg-dim">
            Desktop audio capture requires Chrome or Edge. Switch browsers, then pick Desktop again.
          </p>
        ) : os === 'mac' ? (
          <div className="space-y-3 text-sm text-torus-fg-dim">
            <p>
              macOS does not let Chrome capture system audio when you share the entire screen. To
              visualize Spotify, Ableton, Splice, or any desktop app:
            </p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Install the free{' '}
                <a
                  href="https://github.com/ExistentialAudio/BlackHole"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-torus-mid hover:underline"
                >
                  BlackHole
                </a>{' '}
                loopback driver.
              </li>
              <li>
                Route your app output to BlackHole 2ch (Audio MIDI Setup → Multi-Output Device).
              </li>
              <li>
                In torus visualizer, pick <strong className="text-torus-fg">Mic</strong> and select
                BlackHole 2ch as the input.
              </li>
            </ol>
            <button type="button" onClick={() => onPick('tab')} className={bigButton}>
              <span className="text-sm font-medium text-torus-fg">Share a browser tab instead</span>
              <span className="text-xs text-torus-fg-faint">
                Works without BlackHole — pick a tab that&apos;s playing audio.
              </span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <button type="button" onClick={() => onPick('everything')} className={bigButton}>
              <span className="text-sm font-medium text-torus-fg">Listen to everything</span>
              <span className="text-xs text-torus-fg-dim">
                Your whole computer&apos;s audio — Spotify, Ableton, games, all of it.
              </span>
              <span className="text-[10px] text-torus-fg-faint">
                Keep &ldquo;Also share system audio&rdquo; ticked in Chrome&apos;s dialog.
              </span>
            </button>
            <button type="button" onClick={() => onPick('application')} className={bigButton}>
              <span className="text-sm font-medium text-torus-fg">One application</span>
              <span className="text-xs text-torus-fg-dim">
                Just a single app window or browser tab.
              </span>
              <span className="text-[10px] text-torus-fg-faint">
                Tick &ldquo;Also share audio&rdquo; when you pick it.
              </span>
            </button>
            <p className="text-[10px] text-torus-fg-faint">
              Only the audio is used — the shared video is discarded.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
