'use client';

import { useEffect, useState } from 'react';
import { hardwareAccelHelpUrl, isSoftwareWebGLRenderer } from '@/lib/hwAccel';
import { CloseIcon } from '@/components/ui/icons';
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
      className="flex items-start justify-between gap-3 border-b border-torus-border bg-torus-raised px-4 py-2 text-xs text-torus-fg-dim"
    >
      <p className="leading-relaxed">
        <span className="font-medium text-torus-high">Hardware acceleration looks off.</span> The
        visuals will run slowly until you turn it on in your browser settings.{' '}
        <a
          href={hardwareAccelHelpUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="text-torus-mid underline underline-offset-2"
        >
          How to turn it on
        </a>
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-md p-1 text-torus-fg-dim hover:bg-torus-panel hover:text-torus-fg"
        aria-label="Dismiss the hardware acceleration warning"
      >
        <CloseIcon />
      </button>
    </div>
  );
}
