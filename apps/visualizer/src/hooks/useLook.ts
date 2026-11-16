'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_EMITTER_SETTINGS,
  DEFAULT_SCREEN_EFFECT_SETTINGS,
  VISUALIZERS,
  pickRandomScreenEffect,
  pickRandomVisualizerPreset,
  resolveVisualizerId,
  sanitizeEmitterSettings,
  sanitizeScreenEffectSettings,
  type EmitterSettings,
  type ModRouting,
  type ScreenEffectSettings,
  type VisualizerId,
} from '@torus/visualizers';
import type { WaveformPalette } from '@torus/shared';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useToast } from '@/hooks/useToast';
import { createFactoryLookState } from '@/lib/factoryReset';
import { loadModMatrix, persistModMatrix } from '@/lib/modMatrix';
import { BUILTIN_PALETTES, DEFAULT_PALETTE } from '@/lib/palettes';
import type { ShowFileState, TorusShowFile } from '@/lib/showFile';
import { captureThumbnailDataUrl } from '@/lib/snapshot';
import {
  BACKGROUND_KEY,
  CONTROLS_KEY,
  DEFAULT_BACKGROUND,
  DEFAULT_CONTROLS,
  DEFAULT_TITLE_OVERLAY,
  EMITTER_KEY,
  PALETTE_KEY,
  PRESET_KEY,
  SCREEN_EFFECT_KEY,
  THUMBNAIL_STORAGE_BUDGET_BYTES,
  TITLE_OVERLAY_KEY,
  controlsFromSavedPreset,
  estimateLocalStorageBytes,
  loadSavedPresets,
  persistSavedPresets,
  type BackgroundSettings,
  type SavedPreset,
  type TitleOverlay,
  type VisualizerControls,
} from '@/lib/storage';
import {
  loadTriggerMappings,
  persistTriggerMappings,
  type TriggerMapping,
} from '@/lib/triggerActions';

const VISUALIZER_ORDER = Object.keys(VISUALIZERS) as VisualizerId[];
const FALLBACK_VISUALIZER: VisualizerId = 'flow_field';

interface UseLookOptions {
  /** Softens the look when the user prefers reduced motion. */
  reducedMotion: boolean;
}

/**
 * Everything that defines how the visuals look and react: the visualizer, its
 * palette and sliders, the backdrop, screen style, particles, title card,
 * triggers, and modulations. All of it persists in `localStorage`.
 *
 * The hook also owns the operations that replace the look as a whole: loading
 * a saved look, importing a show file, and resetting to the factory look.
 */
export function useLook({ reducedMotion }: UseLookOptions) {
  const { toast, prompt } = useToast();

  const [preset, setPreset] = usePersistedState<VisualizerId>(
    PRESET_KEY,
    FALLBACK_VISUALIZER,
    (value) => (typeof value === 'string' ? (resolveVisualizerId(value) ?? undefined) : undefined),
  );
  const [palette, setPalette] = usePersistedState<WaveformPalette>(PALETTE_KEY, DEFAULT_PALETTE);
  const [controls, setControls] = usePersistedState<VisualizerControls>(
    CONTROLS_KEY,
    DEFAULT_CONTROLS,
    (value) =>
      value && typeof value === 'object'
        ? { ...DEFAULT_CONTROLS, ...(value as Partial<VisualizerControls>) }
        : undefined,
  );
  const [background, setBackground] = usePersistedState<BackgroundSettings>(
    BACKGROUND_KEY,
    DEFAULT_BACKGROUND,
  );
  const [screenEffect, setScreenEffect] = usePersistedState<ScreenEffectSettings>(
    SCREEN_EFFECT_KEY,
    { ...DEFAULT_SCREEN_EFFECT_SETTINGS },
    (value) =>
      typeof value === 'object' && value !== null ? sanitizeScreenEffectSettings(value) : undefined,
  );
  const [emitter, setEmitter] = usePersistedState<EmitterSettings>(
    EMITTER_KEY,
    { ...DEFAULT_EMITTER_SETTINGS },
    (value) =>
      typeof value === 'object' && value !== null ? sanitizeEmitterSettings(value) : undefined,
  );
  const [titleOverlay, setTitleOverlay] = usePersistedState<TitleOverlay>(
    TITLE_OVERLAY_KEY,
    DEFAULT_TITLE_OVERLAY,
  );

  // Triggers fire one-shot actions. The modulation matrix routes continuous
  // signals to controls. Both persist through their own modules.
  const [triggerMappings, setTriggerMappingsState] = useState<TriggerMapping[]>([]);
  const [modMatrix, setModMatrixState] = useState<ModRouting[]>([]);
  useEffect(() => {
    setTriggerMappingsState(loadTriggerMappings());
    setModMatrixState(loadModMatrix());
  }, []);
  const setTriggerMappings = useCallback((next: TriggerMapping[]) => {
    setTriggerMappingsState(next);
    persistTriggerMappings(next);
  }, []);
  const setModMatrix = useCallback((next: ModRouting[]) => {
    setModMatrixState(next);
    persistModMatrix(next);
  }, []);

  // Saved looks live in localStorage, outside React state. Bumping this number
  // tells the list to read them again.
  const [savedLooksVersion, setSavedLooksVersion] = useState(0);
  const refreshSavedLooks = useCallback(() => setSavedLooksVersion((version) => version + 1), []);

  useEffect(() => {
    if (!reducedMotion) return;
    setControls((current) => ({
      ...current,
      reactivity: Math.min(current.reactivity, 0.4),
      bloomIntensity: Math.min(current.bloomIntensity, 0.7),
    }));
  }, [reducedMotion, setControls]);

  const patchControls = useCallback(
    (patch: Partial<VisualizerControls>) => setControls((current) => ({ ...current, ...patch })),
    [setControls],
  );
  const patchBackground = useCallback(
    (patch: Partial<BackgroundSettings>) => setBackground((current) => ({ ...current, ...patch })),
    [setBackground],
  );
  const patchTitleOverlay = useCallback(
    (patch: Partial<TitleOverlay>) => setTitleOverlay((current) => ({ ...current, ...patch })),
    [setTitleOverlay],
  );

  /**
   * Switches visualizer and applies its hand-tuned slider defaults from the
   * registry. Fields a visualizer does not define keep their current values,
   * so audio-response tuning survives switching.
   */
  const selectVisualizer = useCallback(
    (id: VisualizerId) => {
      setPreset(id);
      const defaults = VISUALIZERS[id].defaults;
      if (defaults) setControls((current) => ({ ...current, ...defaults }));
    },
    [setControls, setPreset],
  );

  const stepVisualizer = useCallback(
    (direction: 1 | -1) => {
      const index = VISUALIZER_ORDER.indexOf(preset);
      const count = VISUALIZER_ORDER.length;
      selectVisualizer(VISUALIZER_ORDER[(index + direction + count) % count]!);
    },
    [preset, selectVisualizer],
  );

  const randomVisualizer = useCallback(() => {
    selectVisualizer(pickRandomVisualizerPreset());
  }, [selectVisualizer]);

  const randomPalette = useCallback(() => {
    const others = BUILTIN_PALETTES.filter(
      (candidate) =>
        candidate.palette.bass !== palette.bass ||
        candidate.palette.mid !== palette.mid ||
        candidate.palette.high !== palette.high,
    );
    const pick = others[Math.floor(Math.random() * others.length)] ?? BUILTIN_PALETTES[0]!;
    setPalette(pick.palette);
  }, [palette, setPalette]);

  const randomScreenEffect = useCallback(() => {
    setScreenEffect((current) => ({ ...current, id: pickRandomScreenEffect(current.id) }));
  }, [setScreenEffect]);

  /** Restores the factory look after asking. Saved looks and export settings are kept. */
  const resetToFactory = useCallback(() => {
    const confirmed = window.confirm(
      'Reset the look to its defaults and remove all triggers and modulations? Saved looks and export settings are kept.',
    );
    if (!confirmed) return;

    const factory = createFactoryLookState();
    setPreset(factory.preset);
    setPalette(factory.palette);
    setControls(factory.controls);
    setBackground(factory.background);
    setTitleOverlay(factory.titleOverlay);
    setScreenEffect(factory.screenEffect);
    setEmitter(factory.emitter);
    setTriggerMappings(factory.triggerMappings);
    setModMatrix(factory.modMatrix);
    toast({ message: 'Look reset to defaults', variant: 'success' });
  }, [
    setPreset,
    setPalette,
    setControls,
    setBackground,
    setTitleOverlay,
    setScreenEffect,
    setEmitter,
    setTriggerMappings,
    setModMatrix,
    toast,
  ]);

  /** Snapshots the whole setup for a show file. */
  const buildShowState = useCallback(
    (): ShowFileState => ({
      preset,
      palette,
      controls,
      background,
      screenEffect,
      emitter,
      titleOverlay,
      triggerMappings,
      modMatrix,
      savedPresets: loadSavedPresets(),
    }),
    [
      preset,
      palette,
      controls,
      background,
      screenEffect,
      emitter,
      titleOverlay,
      triggerMappings,
      modMatrix,
    ],
  );

  const importShow = useCallback(
    (show: TorusShowFile) => {
      setPreset(show.preset);
      setPalette(show.palette);
      setControls(show.controls);
      setBackground(show.background);
      setScreenEffect(show.screenEffect);
      setEmitter(show.emitter);
      setTitleOverlay(show.titleOverlay);
      setTriggerMappings(show.triggerMappings);
      setModMatrix(show.modMatrix);
      if (show.savedPresets.length > 0) {
        // Merge by id. Imported looks replace same-id ones and the rest survive.
        const merged = new Map(loadSavedPresets().map((saved) => [saved.id, saved]));
        for (const saved of show.savedPresets) merged.set(saved.id, saved);
        try {
          persistSavedPresets([...merged.values()]);
          refreshSavedLooks();
        } catch {
          // Storage is full. The look still loads, without the saved looks.
        }
      }
      toast({ message: 'Show loaded', variant: 'success' });
    },
    [
      setPreset,
      setPalette,
      setControls,
      setBackground,
      setScreenEffect,
      setEmitter,
      setTitleOverlay,
      setTriggerMappings,
      setModMatrix,
      refreshSavedLooks,
      toast,
    ],
  );

  const loadSavedLook = useCallback(
    (saved: SavedPreset) => {
      // A saved look can point at a visualizer that has since been retired.
      setPreset(resolveVisualizerId(saved.presetId) ?? FALLBACK_VISUALIZER);
      setPalette(saved.palette);
      setControls(controlsFromSavedPreset(saved));
      setScreenEffect(sanitizeScreenEffectSettings(saved.screenEffect));
      setEmitter(sanitizeEmitterSettings(saved.emitter));
    },
    [setPreset, setPalette, setControls, setScreenEffect, setEmitter],
  );

  /** Asks for a name, then saves the current look with a thumbnail of `canvas`. */
  const saveCurrentLook = useCallback(
    async (canvas: HTMLCanvasElement | null) => {
      const name = (
        await prompt({ message: 'Name this look', placeholder: 'My look', confirmLabel: 'Save' })
      )?.trim();
      if (!name) return;

      let thumbnail: string | undefined;
      if (canvas && estimateLocalStorageBytes() < THUMBNAIL_STORAGE_BUDGET_BYTES) {
        try {
          thumbnail = captureThumbnailDataUrl(canvas);
        } catch {
          thumbnail = undefined;
        }
      }

      const existing = loadSavedPresets();
      const entry: SavedPreset = {
        id: crypto.randomUUID(),
        name,
        createdAt: new Date().toISOString(),
        thumbnail,
        presetId: preset,
        palette,
        ...controls,
        screenEffect: { ...screenEffect },
        emitter: { ...emitter },
      };
      try {
        persistSavedPresets([entry, ...existing]);
        refreshSavedLooks();
        toast({ message: `Saved "${name}"`, variant: 'success' });
      } catch {
        // A quota error usually comes from the embedded thumbnail, so retry without it.
        const withoutThumbnail = { ...entry };
        delete withoutThumbnail.thumbnail;
        try {
          persistSavedPresets([withoutThumbnail, ...existing]);
          refreshSavedLooks();
          toast({
            message: `Saved "${name}" without a thumbnail because browser storage is full`,
            variant: 'info',
          });
        } catch {
          toast({ message: 'Could not save this look', variant: 'error' });
        }
      }
    },
    [preset, palette, controls, screenEffect, emitter, prompt, refreshSavedLooks, toast],
  );

  return {
    preset,
    palette,
    controls,
    background,
    screenEffect,
    emitter,
    titleOverlay,
    triggerMappings,
    modMatrix,
    savedLooksVersion,

    setPalette,
    setScreenEffect,
    setEmitter,
    setTitleOverlay,
    setTriggerMappings,
    setModMatrix,
    patchControls,
    patchBackground,
    patchTitleOverlay,

    selectVisualizer,
    stepVisualizer,
    randomVisualizer,
    randomPalette,
    randomScreenEffect,
    resetToFactory,
    buildShowState,
    importShow,
    loadSavedLook,
    saveCurrentLook,
    refreshSavedLooks,
  };
}

export type Look = ReturnType<typeof useLook>;
