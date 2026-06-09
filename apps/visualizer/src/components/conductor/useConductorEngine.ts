'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  conductorEngine,
  type PresetInfo,
  type SoundfontInfo,
  type SoundfontLoadProgress,
} from '@/lib/conductor/engine';

export interface ConductorEngineState {
  ready: boolean;
  loading: boolean;
  error: string | null;
  loadProgress: SoundfontLoadProgress | null;
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
    loadProgress: null,
    soundfonts: [],
    presets: conductorEngine.getPresets(),
  });
  const attemptRef = useRef(0);

  const loadDefault = useCallback(async (attempt: number) => {
    setState((s) => ({ ...s, loading: true, error: null, loadProgress: null }));
    try {
      const sf = await conductorEngine.ensureDefaultSoundfont((progress) => {
        if (attemptRef.current !== attempt) return;
        setState((s) => ({ ...s, loadProgress: progress }));
      });
      if (attemptRef.current !== attempt) return;
      setState({
        ready: true,
        loading: false,
        error: null,
        loadProgress: null,
        soundfonts: [sf],
        presets: sf.presets,
      });
    } catch (err) {
      if (attemptRef.current !== attempt) return;
      setState((s) => ({
        ...s,
        ready: false,
        loading: false,
        error: (err as Error).message,
        loadProgress: null,
      }));
    }
  }, []);

  useEffect(() => {
    const attempt = ++attemptRef.current;
    loadDefault(attempt);
    return () => {
      attemptRef.current++;
    };
  }, [loadDefault]);

  const retry = useCallback(() => {
    conductorEngine.resetDefaultSoundfont();
    const attempt = ++attemptRef.current;
    void loadDefault(attempt);
  }, [loadDefault]);

  const addSoundfont = useCallback(async (file: File): Promise<SoundfontInfo> => {
    const sf = await conductorEngine.loadSoundfont(file);
    setState((s) => ({
      ...s,
      soundfonts: [...s.soundfonts, sf],
      presets: conductorEngine.getPresets(),
    }));
    return sf;
  }, []);

  return { ...state, addSoundfont, retry };
}

export type { PresetInfo, SoundfontInfo };
