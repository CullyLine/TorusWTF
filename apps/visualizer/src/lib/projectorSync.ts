import type {
  AudioMetrics,
  EmitterSettings,
  ModRouting,
  ScreenEffectSettings,
  VisualImpulses,
  VisualizerId,
} from '@torus/visualizers';
import type { WaveformPalette } from '@torus/shared';
import type { BackgroundSettings, VisualizerControls } from '@/lib/storage';

/**
 * Projector sync protocol — main window ⇄ pop-out projector window over a
 * BroadcastChannel (same-origin, zero-config, survives devtools).
 *
 * The main window stays the brain: it plays audio, computes metrics, and
 * owns all state. The projector is a dumb renderer — it receives state
 * snapshots when something changes and a metrics stream every frame, and
 * feeds them into its own VisualizerCanvas via `externalMetricsRef`.
 * Modeled on nw_wrld's dashboard/projector split, minus Electron.
 */

export const PROJECTOR_CHANNEL = 'torus-projector';

export interface ProjectorStatePayload {
  preset: VisualizerId;
  palette: WaveformPalette;
  controls: VisualizerControls;
  background: BackgroundSettings;
  /** Optional so a projector kept open across a hot upgrade falls back safely. */
  screenEffect?: ScreenEffectSettings;
  emitter?: EmitterSettings;
  /** Modulation-matrix routings — the projector runs the same math locally. */
  modMatrix: ModRouting[];
}

export type ProjectorMessage =
  /** projector → main: "I just opened, send me everything." */
  | { type: 'hello' }
  /** projector → main: closing. */
  | { type: 'bye' }
  /** main → projector: full look snapshot (sent on change, cheap). */
  | { type: 'state'; state: ProjectorStatePayload }
  /** main → projector: fresh metrics, every animation frame. */
  | { type: 'metrics'; metrics: AudioMetrics }
  /** main → projector: one-shot visual impulse from a trigger. */
  | { type: 'impulse'; field: keyof VisualImpulses; strength: number };

/**
 * Merge a cross-window impulse defensively. BroadcastChannel payloads are
 * runtime data despite their TypeScript annotation, so malformed fields or
 * non-finite strengths must not poison the shared ref with NaN.
 */
export function applyProjectorImpulse(
  impulses: VisualImpulses,
  field: unknown,
  strength: unknown,
): boolean {
  if (
    typeof field !== 'string' ||
    !Object.prototype.hasOwnProperty.call(impulses, field) ||
    typeof strength !== 'number' ||
    !Number.isFinite(strength) ||
    strength <= 0
  ) {
    return false;
  }

  const key = field as keyof VisualImpulses;
  const incoming = key === 'emitterBurst' ? Math.min(1, strength) : strength;
  const current = Number.isFinite(impulses[key]) ? Math.max(0, impulses[key]) : 0;
  impulses[key] = Math.max(current, incoming);
  return true;
}
