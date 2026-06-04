'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ConductorScheduler, type LoopRegion } from '@/lib/conductor/scheduler';
import { projectLengthTicks, type ConductorProject } from '@/lib/conductor/project';
import { TICKS_PER_BAR } from './layout';

export interface ConductorPlayback {
  isPlaying: boolean;
  playheadTick: number;
  loop: LoopRegion;
  play: (fromTick?: number) => void;
  stop: () => void;
  toggle: () => void;
  seek: (tick: number) => void;
  setLoopEnabled: (enabled: boolean) => void;
  setLoopRegion: (startTick: number, endTick: number) => void;
}

export function useConductorPlayback(project: ConductorProject): ConductorPlayback {
  const schedRef = useRef<ConductorScheduler | null>(null);
  if (!schedRef.current) schedRef.current = new ConductorScheduler();

  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadTick, setPlayheadTick] = useState(0);
  const [loop, setLoop] = useState<LoopRegion>({
    enabled: false,
    startTick: 0,
    endTick: TICKS_PER_BAR * 4,
  });

  const rafRef = useRef<number | null>(null);
  const projectRef = useRef(project);
  projectRef.current = project;
  const loopRef = useRef(loop);
  loopRef.current = loop;

  const cancelRaf = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const stop = useCallback(() => {
    schedRef.current?.stop();
    cancelRaf();
    setIsPlaying(false);
  }, []);

  const play = useCallback((fromTick?: number) => {
    const sched = schedRef.current!;
    const start = fromTick ?? playheadTick;
    const currentLoop = loopRef.current;
    sched.start(projectRef.current, start, currentLoop);
    setIsPlaying(true);
    cancelRaf();

    const end = projectLengthTicks(projectRef.current);
    const tickLoop = () => {
      const t = sched.getTick();
      setPlayheadTick(t);
      if (!currentLoop.enabled && end > 0 && t >= end) {
        sched.stop();
        setIsPlaying(false);
        setPlayheadTick(start);
        rafRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(tickLoop);
    };
    rafRef.current = requestAnimationFrame(tickLoop);
  }, [playheadTick]);

  const toggle = useCallback(() => {
    if (schedRef.current?.playing) stop();
    else play();
  }, [play, stop]);

  const seek = useCallback(
    (tick: number) => {
      const clamped = Math.max(0, tick);
      setPlayheadTick(clamped);
      if (schedRef.current?.playing) play(clamped);
    },
    [play],
  );

  const setLoopEnabled = useCallback((enabled: boolean) => {
    setLoop((l) => ({ ...l, enabled }));
  }, []);

  const setLoopRegion = useCallback((startTick: number, endTick: number) => {
    setLoop((l) => ({ ...l, startTick: Math.max(0, startTick), endTick: Math.max(startTick + 1, endTick) }));
  }, []);

  useEffect(() => () => stop(), [stop]);

  return {
    isPlaying,
    playheadTick,
    loop,
    play,
    stop,
    toggle,
    seek,
    setLoopEnabled,
    setLoopRegion,
  };
}
