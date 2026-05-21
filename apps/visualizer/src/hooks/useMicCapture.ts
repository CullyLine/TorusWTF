'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useMicCapture() {
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
    try {
      const next = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = next;
      setStream(next);
      return next;
    } catch {
      setError('Microphone access was denied or is unavailable.');
      return null;
    }
  }, [stop]);

  useEffect(() => () => stop(), [stop]);

  return { stream, error, start, stop };
}
