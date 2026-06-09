'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

export function usePersistedState<T>(
  key: string,
  initial: T,
  /**
   * Optional guard run against the value read back from localStorage.
   * Return a coerced/clamped value, or `undefined` to fall back to
   * `initial` — protects the UI from stale or corrupt persisted state.
   */
  sanitize?: (persisted: unknown) => T | undefined,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  const hydratedRef = useRef(false);
  const sanitizeRef = useRef(sanitize);
  sanitizeRef.current = sanitize;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        const parsed = JSON.parse(raw) as unknown;
        const guard = sanitizeRef.current;
        if (guard) {
          const next = guard(parsed);
          if (next !== undefined) setValue(next);
        } else {
          setValue(parsed as T);
        }
      }
    } catch {
      // ignore corrupt storage
    }
    hydratedRef.current = true;
  }, [key]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // ignore quota errors
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [key, value]);

  return [value, setValue];
}
