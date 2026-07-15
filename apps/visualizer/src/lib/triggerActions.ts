/**
 * Trigger mapping — the contract between input sources (audio one-shots,
 * MIDI notes, keyboard) and the actions they fire (preset changes, visual
 * impulses). Inspired by nw_wrld's channel/method trigger routing, adapted
 * to TorusFM's continuous-visual model.
 *
 * Data model only — the runtime engine lives in `useTriggerEngine`, the
 * mapping UI in `TriggerPanel`, and the MIDI adapter in `lib/midi.ts`.
 */

/** Where a trigger comes from. */
export type TriggerSourceKind =
  | 'beat' // every detected beat onset
  | 'bar' // every 4/4 bar boundary (needs BPM lock)
  | 'bassHit' // strong bass transient (kick-drum-ish)
  | 'drop' // detected drop moment
  | 'midiNote'; // a MIDI note-on (optionally filtered to one note)

/** What a trigger does when it fires. */
export type TriggerActionKind =
  | 'nextPreset'
  | 'prevPreset'
  | 'randomPreset'
  | 'randomPalette'
  | 'hueKick' // living-palette hue jolt (same feel as a drop kick)
  | 'camPunch' // one-shot camera FOV punch-in
  | 'bloomPulse' // one-shot bloom surge
  | 'flash'; // brief full-scene light flash

export interface TriggerMapping {
  id: string;
  enabled: boolean;
  source: TriggerSourceKind;
  /**
   * For `midiNote` sources: restrict to this MIDI note number (0-127).
   * null/undefined = any note fires it.
   */
  midiNote?: number | null;
  action: TriggerActionKind;
}

export const TRIGGER_SOURCE_LABELS: Record<TriggerSourceKind, string> = {
  beat: 'Every beat',
  bar: 'Every bar',
  bassHit: 'Bass hit',
  drop: 'Drop',
  midiNote: 'MIDI note',
};

export const TRIGGER_ACTION_LABELS: Record<TriggerActionKind, string> = {
  nextPreset: 'Next preset',
  prevPreset: 'Previous preset',
  randomPreset: 'Random preset',
  randomPalette: 'Random palette',
  hueKick: 'Color kick',
  camPunch: 'Camera punch',
  bloomPulse: 'Glow pulse',
  flash: 'Flash',
};

export const TRIGGER_SOURCES: TriggerSourceKind[] = Object.keys(
  TRIGGER_SOURCE_LABELS,
) as TriggerSourceKind[];

export const TRIGGER_ACTIONS: TriggerActionKind[] = Object.keys(
  TRIGGER_ACTION_LABELS,
) as TriggerActionKind[];

export const TRIGGER_MAPPINGS_KEY = 'torus-visualizer-trigger-mappings';

/** Sensible starter row shown when the user opens the panel with no mappings. */
export function createMapping(partial?: Partial<TriggerMapping>): TriggerMapping {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    source: 'drop',
    action: 'hueKick',
    midiNote: null,
    ...partial,
  };
}

export function loadTriggerMappings(): TriggerMapping[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TRIGGER_MAPPINGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidMapping);
  } catch {
    return [];
  }
}

export function persistTriggerMappings(mappings: TriggerMapping[]): void {
  try {
    localStorage.setItem(TRIGGER_MAPPINGS_KEY, JSON.stringify(mappings));
  } catch {
    // Storage full/unavailable — mappings just don't survive the reload.
  }
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
