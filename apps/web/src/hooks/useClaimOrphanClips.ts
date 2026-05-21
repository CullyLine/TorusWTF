'use client';

import { useEffect, useRef } from 'react';
import { useToast } from '@torus/ui';
import { useSessionUser } from '@/hooks/useSessionUser';
import {
  CLAIM_TOKENS_STORAGE_KEY,
  getAllStoredClaimTokens,
  type StoredClaimToken,
} from '@/lib/claim-tokens';

export function useClaimOrphanClips() {
  const { user, loaded } = useSessionUser();
  const toast = useToast();
  const claimedRef = useRef(false);
  const prevUserRef = useRef<typeof user>(null);

  useEffect(() => {
    if (!loaded) return;
    const wasLoggedOut = prevUserRef.current === null;
    prevUserRef.current = user;

    if (!user || !wasLoggedOut || claimedRef.current) return;

    const tokens = getAllStoredClaimTokens();
    if (tokens.length === 0) return;

    claimedRef.current = true;
    void (async () => {
      try {
        const res = await fetch('/api/clips/claim', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ claimTokens: tokens }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          claimed?: { id: string; shareCode: string }[];
        };
        const claimed = data.claimed ?? [];
        if (claimed.length === 0) return;

        if (typeof localStorage !== 'undefined') {
          const claimedCodes = new Set(claimed.map((c) => c.shareCode.toUpperCase()));
          const items = JSON.parse(
            localStorage.getItem(CLAIM_TOKENS_STORAGE_KEY) || '[]',
          ) as StoredClaimToken[];
          const next = items.filter((x) => !claimedCodes.has(x.shareCode.toUpperCase()));
          localStorage.setItem(CLAIM_TOKENS_STORAGE_KEY, JSON.stringify(next));
        }

        const n = claimed.length;
        toast.show(
          `Found ${n} clip${n === 1 ? '' : 's'} you uploaded earlier — they're on your profile now.`,
          'success',
        );
      } catch {
        claimedRef.current = false;
      }
    })();
  }, [user, loaded, toast]);
}
