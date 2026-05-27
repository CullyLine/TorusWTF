'use client';

import { useEffect, useState } from 'react';
import { hardwareAccelHelpUrl, isSoftwareWebGLRenderer } from '@/lib/hwAccel';
import { HWACCEL_BANNER_DISMISSED_KEY } from '@/lib/storage';

export function HwAccelBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(HWACCEL_BANNER_DISMISSED_KEY) === '1') return;
    setVisible(isSoftwareWebGLRenderer());
  }, []);

  const dismiss = () => {
    localStorage.setItem(HWACCEL_BANNER_DISMISSED_KEY, '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="status"
      className="border-b border-torus-high/30 bg-torus-high/10 px-4 py-2.5 text-sm text-torus-fg"
    >
      <div className="mx-auto flex max-w-6xl items-start justify-between gap-3">
        <p className="text-xs leading-relaxed text-torus-fg-dim">
          Hardware acceleration appears to be off. Visualizers may run slowly. Enable it in your
          browser settings for the best experience.{' '}
          <a
            href={hardwareAccelHelpUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="text-torus-mid underline underline-offset-2 hover:text-torus-fg"
          >
            How to enable
          </a>
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded border border-torus-border px-2 py-0.5 text-xs text-torus-fg-faint hover:border-torus-mid/40 hover:text-torus-fg"
          aria-label="Dismiss hardware acceleration warning"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
