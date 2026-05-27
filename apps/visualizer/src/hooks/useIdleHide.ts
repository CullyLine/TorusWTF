'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_IDLE_MS = 2_500;

interface UseIdleHideOptions {
  forceVisible?: boolean;
  idleMs?: number;
}

export function useIdleHide({ forceVisible = false, idleMs = DEFAULT_IDLE_MS }: UseIdleHideOptions = {}) {
  const [uiVisible, setUiVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearTimer();
    if (forceVisible) return;
    timerRef.current = setTimeout(() => setUiVisible(false), idleMs);
  }, [clearTimer, forceVisible, idleMs]);

  const reveal = useCallback(() => {
    setUiVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  const hide = useCallback(() => {
    if (forceVisible) return;
    clearTimer();
    setUiVisible(false);
  }, [clearTimer, forceVisible]);

  useEffect(() => {
    if (forceVisible) {
      setUiVisible(true);
      clearTimer();
      return;
    }
    scheduleHide();
    return clearTimer;
  }, [forceVisible, scheduleHide, clearTimer]);

  return {
    uiVisible: forceVisible || uiVisible,
    reveal,
    hide,
  };
}
