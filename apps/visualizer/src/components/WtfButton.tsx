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

interface WtfButtonProps {
  onPlay: (track: DemoTrack) => void;
  activeTitle: string | null;
}

export function WtfButton({ onPlay, activeTitle }: WtfButtonProps) {
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

  const pickRandom = useCallback(() => {
    if (tracks.length === 0) return;
    const pool = tracks.filter((t) => !playedRef.current.includes(t.id));
    const candidates = pool.length > 0 ? pool : tracks;
    if (pool.length === 0) playedRef.current = [];
    const track = candidates[Math.floor(Math.random() * candidates.length)]!;
    playedRef.current.push(track.id);
    onPlay(track);
  }, [tracks, onPlay]);

  if (tracks.length === 0) return null;

  return (
    <button
      type="button"
      onClick={pickRandom}
      className="rounded-full border border-torus-mid/40 bg-torus-mid/10 px-3 py-1.5 text-xs font-semibold text-torus-mid hover:bg-torus-mid/20"
      title="Play a random demo track"
    >
      {activeTitle ? `♫ ${activeTitle}` : 'WTF'}
    </button>
  );
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
