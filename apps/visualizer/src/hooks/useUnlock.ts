'use client';

import { useCallback, useEffect, useState } from 'react';
import { LICENSE_STORAGE_KEY, LICENSE_VERIFIED_AT_KEY } from '@/lib/storage';
import { useSessionUser } from '@/hooks/useSessionUser';

const VERIFY_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Export-gating state for the visualizer.
 *
 * Source of truth is the signed-in account's one-time Production License
 * (`hasLicense` from /api/auth/me). A local dev/test license key is still
 * honored as an escape hatch so the pro paths (1440p, high fps, watermark
 * removal, saved presets, title-overlay styling) can be exercised without
 * real billing — see TEST_LICENSE_KEY in lib/polar.ts.
 */
export function useUnlock() {
  const { user, loaded } = useSessionUser();
  const [testUnlocked, setTestUnlocked] = useState(false);
  const [testChecking, setTestChecking] = useState(true);
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
        setTestUnlocked(true);
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
    setTestUnlocked(false);
  }, []);

  useEffect(() => {
    const cached = localStorage.getItem(LICENSE_STORAGE_KEY);
    const verifiedAt = Number(localStorage.getItem(LICENSE_VERIFIED_AT_KEY) ?? '0');
    if (!cached) {
      setTestChecking(false);
      return;
    }
    setLicenseKey(cached);
    if (Date.now() - verifiedAt < VERIFY_INTERVAL_MS) {
      setTestUnlocked(true);
      setTestChecking(false);
      return;
    }
    void verify(cached).finally(() => setTestChecking(false));
  }, [verify]);

  const hasAccountLicense = Boolean(user?.hasLicense);
  const unlocked = hasAccountLicense || testUnlocked;
  const checking = !loaded || testChecking;

  // Account license is authoritative — drop any legacy local key so UI stays in sync.
  useEffect(() => {
    if (!hasAccountLicense) return;
    localStorage.removeItem(LICENSE_STORAGE_KEY);
    localStorage.removeItem(LICENSE_VERIFIED_AT_KEY);
    setLicenseKey(null);
    setTestUnlocked(false);
  }, [hasAccountLicense]);

  return { unlocked, checking, hasAccountLicense, licenseKey, activate, deactivate };
}
