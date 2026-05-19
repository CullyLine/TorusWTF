'use client';

import { useCallback, useEffect, useState } from 'react';

export interface SessionUser {
  id: string;
  handle: string;
}

export function useSessionUser(enabled = true) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [discordAuth, setDiscordAuth] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return null;
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (!res.ok) {
        setUser(null);
        return null;
      }
      const data = (await res.json()) as { user: SessionUser | null; discordAuth?: boolean };
      setUser(data.user);
      setDiscordAuth(Boolean(data.discordAuth));
      return data.user;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoaded(true);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  const openDiscordPopup = useCallback(() => {
    window.open(
      '/api/auth/discord?popup=1',
      'torus-discord-auth',
      'width=520,height=720,menubar=no,toolbar=no',
    );
  }, []);

  return { user, loaded, discordAuth, refresh, openDiscordPopup };
}
