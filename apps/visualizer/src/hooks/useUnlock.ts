'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  LICENSE_STORAGE_KEY,
  LICENSE_VERIFIED_AT_KEY,
} from '@/lib/storage';

const VERIFY_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Client-trust unlock gate — good fences for honest people at the $10 price point.
 * Do not bother with stronger DRM unless real piracy data appears.
 */
export function useUnlock() {
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [licenseKey, setLicenseKey] = useState<string | null>(null);

  const verify = useCallback(async (key: string): Promise<{ ok: boolean; reason?: string }> => {
    try {
      const res = await fetch('/api/license/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      const data = (await res.json()) as { valid?: boolean; reason?: string };
      if (data.valid) {
        localStorage.setItem(LICENSE_STORAGE_KEY, key);
        localStorage.setItem(LICENSE_VERIFIED_AT_KEY, String(Date.now()));
        setLicenseKey(key);
        setUnlocked(true);
        return { ok: true };
      }
      return { ok: false, reason: data.reason ?? 'Invalid license key.' };
    } catch {
      return { ok: false, reason: 'Could not verify license key.' };
    }
  }, []);

  const activate = useCallback(
    async (key: string) => {
      const trimmed = key.trim();
      if (!trimmed) return { ok: false, reason: 'Enter a license key.' };
      return verify(trimmed);
    },
    [verify],
  );

  const deactivate = useCallback(() => {
    localStorage.removeItem(LICENSE_STORAGE_KEY);
    localStorage.removeItem(LICENSE_VERIFIED_AT_KEY);
    setLicenseKey(null);
    setUnlocked(false);
  }, []);

  useEffect(() => {
    const cached = localStorage.getItem(LICENSE_STORAGE_KEY);
    const verifiedAt = Number(localStorage.getItem(LICENSE_VERIFIED_AT_KEY) ?? '0');
    if (!cached) {
      setChecking(false);
      return;
    }

    setLicenseKey(cached);

    if (Date.now() - verifiedAt < VERIFY_INTERVAL_MS) {
      setUnlocked(true);
      setChecking(false);
      return;
    }

    void verify(cached).finally(() => setChecking(false));
  }, [verify]);

  return { unlocked, checking, licenseKey, activate, deactivate };
}
