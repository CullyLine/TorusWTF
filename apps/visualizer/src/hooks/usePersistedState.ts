'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

export function usePersistedState<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  const hydratedRef = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        setValue(JSON.parse(raw) as T);
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
