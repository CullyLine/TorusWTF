'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface DemoTrack {
  id: string;
  title: string;
  duration: number;
  artwork: string | null;
  file: string;
  permalink: string;
}

interface DemoManifest {
  source: string;
  fetchedAt: string;
  tracks: DemoTrack[];
}

export interface UseDemoTracksResult {
  tracks: DemoTrack[];
  available: boolean;
  pickRandom: () => DemoTrack | null;
}

export function useDemoTracks(): UseDemoTracksResult {
  const [tracks, setTracks] = useState<DemoTrack[]>([]);
  const playedRef = useRef<string[]>([]);

  useEffect(() => {
    void fetch('/demos/manifest.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: DemoManifest | null) => {
        if (data?.tracks?.length) setTracks(data.tracks);
      })
      .catch(() => {});
  }, []);

  const pickRandom = useCallback((): DemoTrack | null => {
    if (tracks.length === 0) return null;
    const pool = tracks.filter((t) => !playedRef.current.includes(t.id));
    const candidates = pool.length > 0 ? pool : tracks;
    if (pool.length === 0) playedRef.current = [];
    const track = candidates[Math.floor(Math.random() * candidates.length)]!;
    playedRef.current.push(track.id);
    return track;
  }, [tracks]);

  return { tracks, available: tracks.length > 0, pickRandom };
}

export function DemoAttribution() {
  return (
    <a
      href="https://soundcloud.com/animegirlfarts69"
      target="_blank"
      rel="noopener noreferrer"
      className="text-[10px] text-torus-fg-faint hover:text-torus-mid"
    >
      Demos by @animegirlfarts69
    </a>
  );
}
