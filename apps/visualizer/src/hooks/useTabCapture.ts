'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isChromium } from '@/lib/palettes';

export function useTabCapture() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const start = useCallback(async () => {
    stop();
    setError(null);

    if (!isChromium()) {
      setError('Tab audio capture requires Chrome or Edge.');
      return null;
    }

    try {
      const next = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      if (next.getAudioTracks().length === 0) {
        next.getTracks().forEach((t) => t.stop());
        setError(
          'No audio in the shared source. Pick Entire Screen and tick Share system audio, or pick a tab that is playing audio.',
        );
        return null;
      }

      streamRef.current = next;
      setStream(next);
      return next;
    } catch {
      setError('Tab capture was cancelled or denied.');
      return null;
    }
  }, [stop]);

  useEffect(() => () => stop(), [stop]);

  return { stream, error, start, stop };
}
