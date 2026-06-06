'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { conductorEngine } from '@/lib/conductor/engine';
import { ConductorScheduler } from '@/lib/conductor/scheduler';
import { projectLengthTicks, type ConductorProject } from '@/lib/conductor/project';

/**
 * Plays a one-off ConductorProject through the shared spessasynth engine so the
 * Transcriber can audition a transcription on the bundled soundfont — the same
 * sound you'll hear after "Send to Conductor". No persistence, no store.
 */
export function useMidiPreview() {
  const schedRef = useRef<ConductorScheduler | null>(null);
  const rafRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const stop = useCallback(() => {
    schedRef.current?.stop();
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setPlaying(false);
  }, []);

  const play = useCallback(
    async (project: ConductorProject) => {
      await conductorEngine.ensureDefaultSoundfont();
      await conductorEngine.resume();
      if (!schedRef.current) schedRef.current = new ConductorScheduler();
      const sched = schedRef.current;
      sched.start(project, 0, { enabled: false, startTick: 0, endTick: 0 });
      setPlaying(true);

      const endTick = projectLengthTicks(project);
      const watch = () => {
        if (!sched.playing || sched.isFinished(endTick)) {
          stop();
          return;
        }
        rafRef.current = requestAnimationFrame(watch);
      };
      rafRef.current = requestAnimationFrame(watch);
    },
    [stop],
  );

  useEffect(
    () => () => {
      schedRef.current?.stop();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  return { playing, play, stop };
}
