'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { isChromium } from '@/lib/palettes';
import { detectOS } from '@/lib/platform';

interface DesktopAudioGuideProps {
  open: boolean;
  reducedMotion?: boolean;
  onClose: () => void;
  onConfirm: (dontShowAgain: boolean) => void;
}

export function DesktopAudioGuide({
  open,
  reducedMotion = false,
  onClose,
  onConfirm,
}: DesktopAudioGuideProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const os = detectOS();
  const chromium = isChromium();

  useEffect(() => {
    if (!open) return;
    setDontShowAgain(false);
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
            Capture desktop audio
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
            <p className="text-xs text-torus-fg-faint">
              You can still share a browser tab below if that tab is playing audio.
            </p>
          </div>
        ) : (
          <div className="space-y-3 text-sm text-torus-fg-dim">
            <p>
              Capture anything playing on your computer — Spotify, Ableton, Splice, YouTube, or any
              desktop app — in real time. When Chrome&apos;s share dialog opens:
            </p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Click <strong className="text-torus-fg">Entire Screen</strong> at the top of the
                dialog.
              </li>
              <li>
                Tick <strong className="text-torus-fg">Share system audio</strong> at the
                bottom-left.
              </li>
              <li>
                Click <strong className="text-torus-fg">Share</strong>.
              </li>
            </ol>
          </div>
        )}

        {chromium ? (
          <label className="mt-4 flex cursor-pointer items-center gap-2 text-xs text-torus-fg-dim">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="rounded border-torus-border"
            />
            Don&apos;t show this again
          </label>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-torus-border px-4 py-2 text-xs text-torus-fg-dim hover:border-torus-border-strong"
          >
            Cancel
          </button>
          {chromium ? (
            <button
              type="button"
              onClick={() => onConfirm(dontShowAgain)}
              className="rounded-full border border-torus-mid/40 bg-torus-mid/20 px-4 py-2 text-xs font-medium text-torus-mid hover:bg-torus-mid/30"
            >
              Got it, share now
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
