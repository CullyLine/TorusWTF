'use client';

import { useCallback, useEffect, useState } from 'react';
import { conductorEngine, type PresetInfo, type SoundfontInfo } from '@/lib/conductor/engine';

export interface ConductorEngineState {
  ready: boolean;
  loading: boolean;
  error: string | null;
  soundfonts: SoundfontInfo[];
  presets: PresetInfo[];
}

/**
 * Initializes the shared ConductorEngine and loads the bundled soundfont on
 * mount. Returns engine status plus the flattened preset list for pickers.
 */
export function useConductorEngine() {
  const [state, setState] = useState<ConductorEngineState>({
    ready: conductorEngine.isInitialized,
    loading: true,
    error: null,
    soundfonts: [],
    presets: conductorEngine.getPresets(),
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sf = await conductorEngine.ensureDefaultSoundfont();
        if (cancelled) return;
        setState({ ready: true, loading: false, error: null, soundfonts: [sf], presets: sf.presets });
      } catch (err) {
        if (cancelled) return;
        setState((s) => ({ ...s, loading: false, error: (err as Error).message }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addSoundfont = useCallback(async (file: File): Promise<SoundfontInfo> => {
    const sf = await conductorEngine.loadSoundfont(file);
    setState((s) => ({
      ...s,
      soundfonts: [...s.soundfonts, sf],
      presets: conductorEngine.getPresets(),
    }));
    return sf;
  }, []);

  return { ...state, addSoundfont };
}

export type { PresetInfo, SoundfontInfo };
