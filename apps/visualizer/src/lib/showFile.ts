import type { WaveformPalette } from '@torus/shared';
import {
  BACKGROUND_MODES,
  VISUALIZERS,
  type BackgroundMode,
  type CameraMode,
  type VisualizerId,
} from '@torus/visualizers';
import {
  DEFAULT_BACKGROUND,
  DEFAULT_CONTROLS,
  DEFAULT_TITLE_OVERLAY,
  type BackgroundSettings,
  type OverlayPosition,
  type SavedPreset,
  type TitleOverlay,
  type VisualizerControls,
} from './storage';
import {
  TRIGGER_ACTIONS,
  TRIGGER_SOURCES,
  type TriggerMapping,
} from './triggerActions';

export interface TorusShowFile {
  kind: 'torus-show';
  version: 1;
  exportedAt: string;
  preset: VisualizerId;
  palette: WaveformPalette;
  controls: VisualizerControls;
  background: BackgroundSettings;
  titleOverlay: TitleOverlay;
  triggerMappings: TriggerMapping[];
  savedPresets: SavedPreset[];
}

export interface ShowFileState {
  preset: VisualizerId;
  palette: WaveformPalette;
  controls: VisualizerControls;
  background: BackgroundSettings;
  titleOverlay: TitleOverlay;
  triggerMappings: TriggerMapping[];
  savedPresets: SavedPreset[];
}

export type ParseShowResult =
  | { ok: true; show: TorusShowFile }
  | { ok: false; error: string };

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const OVERLAY_POSITIONS: OverlayPosition[] = [
  'bottom-left',
  'bottom-center',
  'top-left',
  'top-right',
];

export function buildShowFile(state: ShowFileState): TorusShowFile {
  return {
    kind: 'torus-show',
    version: 1,
    exportedAt: new Date().toISOString(),
    preset: state.preset,
    palette: state.palette,
    controls: state.controls,
    background: state.background,
    titleOverlay: state.titleOverlay,
    triggerMappings: state.triggerMappings,
    savedPresets: state.savedPresets,
  };
}

export function serializeShowFile(show: TorusShowFile): string {
  return JSON.stringify(show, null, 2);
}

export function parseShowFile(text: string): ParseShowResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "Couldn't read that file — it isn't valid JSON." };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'Show file must be a JSON object.' };
  }

  const raw = parsed as Record<string, unknown>;

  if (raw.kind !== 'torus-show') {
    return {
      ok: false,
      error: "Not a Torus show file (expected kind \"torus-show\").",
    };
  }

  if (typeof raw.version !== 'number') {
    return { ok: false, error: 'Show file is missing a version number.' };
  }
  if (raw.version !== 1) {
    return {
      ok: false,
      error:
        'This show file was made with a newer version of TorusFM and can\'t be opened here.',
    };
  }

  const presetResult = parsePreset(raw.preset);
  if (!presetResult.ok) return presetResult;
  const preset = presetResult.preset;

  const paletteResult = parsePalette(raw.palette);
  if (!paletteResult.ok) return paletteResult;
  const palette = paletteResult.palette;

  const controls = sanitizeControls(raw.controls);
  const background = sanitizeBackground(raw.background);
  const titleOverlay = sanitizeTitleOverlay(raw.titleOverlay);
  const triggerMappings = sanitizeTriggerMappings(raw.triggerMappings);
  const savedPresets = sanitizeSavedPresets(raw.savedPresets);

  const exportedAt =
    typeof raw.exportedAt === 'string' && raw.exportedAt.length > 0
      ? raw.exportedAt
      : new Date().toISOString();

  return {
    ok: true,
    show: {
      kind: 'torus-show',
      version: 1,
      exportedAt,
      preset,
      palette,
      controls,
      background,
      titleOverlay,
      triggerMappings,
      savedPresets,
    },
  };
}

export function downloadShowFile(show: TorusShowFile): void {
  const json = serializeShowFile(show);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `torus-show-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function parsePreset(
  value: unknown,
): { ok: true; preset: VisualizerId } | { ok: false; error: string } {
  if (typeof value !== 'string') {
    return { ok: false, error: 'Show file is missing a valid preset id.' };
  }
  const migrated = value === 'spectral_tunnel' ? 'infinite_tunnel' : value;
  if (!(migrated in VISUALIZERS)) {
    return {
      ok: false,
      error: `Unknown preset "${value}".`,
    };
  }
  return { ok: true, preset: migrated as VisualizerId };
}

function parsePalette(
  value: unknown,
): { ok: true; palette: WaveformPalette } | { ok: false; error: string } {
  if (typeof value !== 'object' || value === null) {
    return { ok: false, error: 'Show file is missing a valid palette.' };
  }
  const p = value as Record<string, unknown>;
  for (const key of ['bass', 'mid', 'high'] as const) {
    if (typeof p[key] !== 'string' || !HEX_COLOR.test(p[key])) {
      return {
        ok: false,
        error: `Invalid palette color for ${key} (expected #RRGGBB).`,
      };
    }
  }
  return {
    ok: true,
    palette: {
      bass: p.bass as string,
      mid: p.mid as string,
      high: p.high as string,
    },
  };
}

function sanitizeControls(value: unknown): VisualizerControls {
  const result: VisualizerControls = { ...DEFAULT_CONTROLS };
  if (typeof value !== 'object' || value === null) return result;

  const incoming = value as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_CONTROLS) as (keyof VisualizerControls)[]) {
    if (!(key in incoming)) continue;
    const val = incoming[key];
    if (key === 'cameraMode') {
      if (typeof val === 'string') {
        result.cameraMode = val as CameraMode;
      }
      continue;
    }
    if (key === 'autoGain') {
      if (typeof val === 'boolean') {
        result.autoGain = val;
      }
      continue;
    }
    if (typeof val === 'number' && Number.isFinite(val)) {
      (result as unknown as Record<string, unknown>)[key] = val;
    }
  }
  return result;
}

function sanitizeBackground(value: unknown): BackgroundSettings {
  const result: BackgroundSettings = { ...DEFAULT_BACKGROUND };
  if (typeof value !== 'object' || value === null) return result;

  const incoming = value as Record<string, unknown>;
  if (typeof incoming.mode === 'string') {
    result.mode = (BACKGROUND_MODES as string[]).includes(incoming.mode)
      ? (incoming.mode as BackgroundMode)
      : DEFAULT_BACKGROUND.mode;
  }
  if (typeof incoming.intensity === 'number' && Number.isFinite(incoming.intensity)) {
    result.intensity = Math.min(1, Math.max(0, incoming.intensity));
  }
  return result;
}

function sanitizeTitleOverlay(value: unknown): TitleOverlay {
  const result: TitleOverlay = { ...DEFAULT_TITLE_OVERLAY };
  if (typeof value !== 'object' || value === null) return result;

  const incoming = value as Record<string, unknown>;
  if (typeof incoming.enabled === 'boolean') result.enabled = incoming.enabled;
  if (typeof incoming.title === 'string') result.title = incoming.title;
  if (typeof incoming.subtitle === 'string') result.subtitle = incoming.subtitle;
  if (
    typeof incoming.position === 'string' &&
    (OVERLAY_POSITIONS as string[]).includes(incoming.position)
  ) {
    result.position = incoming.position as OverlayPosition;
  }
  if (typeof incoming.textColor === 'string') result.textColor = incoming.textColor;
  if (typeof incoming.bgOpacity === 'number' && Number.isFinite(incoming.bgOpacity)) {
    result.bgOpacity = Math.min(1, Math.max(0, incoming.bgOpacity));
  }
  return result;
}

function isValidMapping(value: unknown): value is TriggerMapping {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    typeof m.enabled === 'boolean' &&
    typeof m.source === 'string' &&
    (TRIGGER_SOURCES as string[]).includes(m.source) &&
    typeof m.action === 'string' &&
    (TRIGGER_ACTIONS as string[]).includes(m.action) &&
    (m.midiNote === null ||
      m.midiNote === undefined ||
      (typeof m.midiNote === 'number' && m.midiNote >= 0 && m.midiNote <= 127))
  );
}

function sanitizeTriggerMappings(value: unknown): TriggerMapping[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return [];
  return value.filter(isValidMapping);
}

function isValidSavedPreset(value: unknown): value is SavedPreset {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.presetId === 'string' &&
    typeof p.palette === 'object' &&
    p.palette !== null
  );
}

function sanitizeSavedPresets(value: unknown): SavedPreset[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return [];
  return value.filter(isValidSavedPreset);
}
