'use client';

import { useEffect, type ReactNode } from 'react';
import { ToastProvider, UploadDialogProvider } from '@torus/ui';
import { useSessionUser } from '@/hooks/useSessionUser';
import { useClaimOrphanClips } from '@/hooks/useClaimOrphanClips';

function UploadAuthProvider({ children }: { children: ReactNode }) {
  const { user, refresh, discordAuth, openDiscordPopup } = useSessionUser(true);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'torus-auth-success') void refresh();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [refresh]);

  return (
    <UploadDialogProvider
      auth={{
        sessionUser: user,
        refreshSession: refresh,
        discordAuth,
        openDiscordSignIn: openDiscordPopup,
      }}
    >
      {children}
    </UploadDialogProvider>
  );
}

function ClaimOnSignIn() {
  useClaimOrphanClips();
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <UploadAuthProvider>
        <ClaimOnSignIn />
        {children}
      </UploadAuthProvider>
    </ToastProvider>
  );
}
