'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const IDLE_HIDE_MS = 2500;

/** Auto-hides overlay chrome after idle; stays visible while `presetOpen`. */
export function useIdleOverlayUi() {
  const [uiVisible, setUiVisible] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (!presetOpen) setUiVisible(false);
    }, IDLE_HIDE_MS);
  }, [presetOpen]);

  const revealUi = useCallback(() => {
    setUiVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    if (presetOpen) {
      setUiVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } else {
      scheduleHide();
    }
  }, [presetOpen, scheduleHide]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  return { uiVisible, presetOpen, setPresetOpen, revealUi };
}
