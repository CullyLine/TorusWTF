'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isChromium } from '@/lib/palettes';

/**
 * What the user asked to listen to. Chrome's native share dialog can't be
 * replaced, but `getDisplayMedia` hints steer which pane it opens on and
 * which audio toggle it offers:
 *
 * - `everything`  → Entire Screen pane + "Also share system audio"
 * - `application` → Window pane + "Also share application audio" (Chrome
 *                   falls back to the system-audio toggle where per-app
 *                   audio capture isn't supported)
 * - `tab`         → Chrome Tab pane + tab audio (works on every platform,
 *                   the macOS fallback)
 */
export type DesktopCaptureMode = 'everything' | 'application' | 'tab';

/**
 * `systemAudio`, `windowAudio`, `monitorTypeSurfaces`, `selfBrowserSurface`
 * and `surfaceSwitching` are Chromium extensions not yet in lib.dom.
 */
type ChromiumDisplayMediaOptions = DisplayMediaStreamOptions & {
  systemAudio?: 'include' | 'exclude';
  windowAudio?: 'window' | 'system' | 'exclude';
  monitorTypeSurfaces?: 'include' | 'exclude';
  selfBrowserSurface?: 'include' | 'exclude';
  surfaceSwitching?: 'include' | 'exclude';
};

const CAPTURE_OPTIONS: Record<DesktopCaptureMode, ChromiumDisplayMediaOptions> = {
  everything: {
    video: { displaySurface: 'monitor' },
    audio: true,
    systemAudio: 'include',
    monitorTypeSurfaces: 'include',
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'include',
  },
  application: {
    video: { displaySurface: 'window' },
    audio: true,
    windowAudio: 'window',
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'include',
  },
  tab: {
    video: { displaySurface: 'browser' },
    audio: true,
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'include',
  },
};

const NO_AUDIO_MESSAGES: Record<DesktopCaptureMode, string> = {
  everything:
    'No audio in the shared source. Keep "Also share system audio" ticked when sharing your screen.',
  application:
    'No audio in the shared source. Tick "Also share audio" when picking the application, or choose a tab that is playing audio.',
  tab: 'No audio from that tab. Pick a tab that is playing audio and keep "Also share tab audio" ticked.',
};

export function useTabCapture() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const start = useCallback(
    async (mode: DesktopCaptureMode = 'everything') => {
      stop();
      setError(null);

      if (!isChromium()) {
        setError('Desktop audio capture requires Chrome or Edge.');
        return null;
      }

      try {
        const next = await navigator.mediaDevices.getDisplayMedia(CAPTURE_OPTIONS[mode]);

        if (next.getAudioTracks().length === 0) {
          next.getTracks().forEach((t) => t.stop());
          setError(NO_AUDIO_MESSAGES[mode]);
          return null;
        }

        streamRef.current = next;
        setStream(next);
        return next;
      } catch {
        setError('Desktop capture was cancelled or denied.');
        return null;
      }
    },
    [stop],
  );

  useEffect(() => () => stop(), [stop]);

  return { stream, error, start, stop };
}
