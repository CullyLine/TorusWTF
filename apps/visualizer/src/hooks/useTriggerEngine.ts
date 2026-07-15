'use client';

import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { AudioMetrics, VisualImpulses } from '@torus/visualizers';
import type { MidiNoteEvent } from '@/lib/midi';
import type { TriggerActionKind, TriggerMapping } from '@/lib/triggerActions';

export interface TriggerEngineActions {
  nextPreset: () => void;
  prevPreset: () => void;
  randomPreset: () => void;
  randomPalette: () => void;
}

interface UseTriggerEngineOptions {
  /** Master switch — off while there's no audio source. */
  enabled: boolean;
  mappings: TriggerMapping[];
  /** Freshest metrics, mirrored out of the canvas every frame. */
  metricsRef: MutableRefObject<AudioMetrics | null>;
  /** Shared impulse object consumed inside the canvas (SceneRig / palette). */
  impulses: VisualImpulses;
  actions: TriggerEngineActions;
  /** Also called for impulse actions — used to mirror them to the projector. */
  onImpulse?: (field: keyof VisualImpulses, strength: number) => void;
}

/**
 * The trigger engine — watches the audio metrics on a rAF loop, derives
 * one-shot events (beat / bar / bass hit / drop) with Schmitt-style
 * hysteresis + cooldowns so nothing double-fires, matches them against the
 * user's mappings, and fires the mapped actions. MIDI notes enter through
 * `handleMidiNote` (wired to `useWebMidi`).
 *
 * Runs entirely outside React state: reading refs, writing impulse fields.
 * Only preset/palette actions touch React, and those are throttled.
 */
export function useTriggerEngine({
  enabled,
  mappings,
  metricsRef,
  impulses,
  actions,
  onImpulse,
}: UseTriggerEngineOptions): { handleMidiNote: (e: MidiNoteEvent) => void } {
  // Refs so the rAF loop and MIDI handler always see fresh values without
  // rebinding.
  const mappingsRef = useRef(mappings);
  mappingsRef.current = mappings;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const impulsesRef = useRef(impulses);
  impulsesRef.current = impulses;
  const onImpulseRef = useRef(onImpulse);
  onImpulseRef.current = onImpulse;

  // Detector state machines.
  const beatArmedRef = useRef(true);
  const bassArmedRef = useRef(true);
  const dropArmedRef = useRef(true);
  const prevBarPhaseRef = useRef(0);
  const lastFireRef = useRef<Record<string, number>>({});

  const fireActionRef = useRef((action: TriggerActionKind, strength: number) => {
    const imp = impulsesRef.current;
    const a = actionsRef.current;
    switch (action) {
      case 'nextPreset':
        a.nextPreset();
        break;
      case 'prevPreset':
        a.prevPreset();
        break;
      case 'randomPreset':
        a.randomPreset();
        break;
      case 'randomPalette':
        a.randomPalette();
        break;
      case 'hueKick':
        imp.hueKick = Math.max(imp.hueKick, strength);
        onImpulseRef.current?.('hueKick', strength);
        break;
      case 'camPunch':
        imp.camPunch = Math.max(imp.camPunch, strength);
        onImpulseRef.current?.('camPunch', strength);
        break;
      case 'bloomPulse':
        imp.bloomPulse = Math.max(imp.bloomPulse, strength);
        onImpulseRef.current?.('bloomPulse', strength);
        break;
      case 'flash':
        imp.flash = Math.max(imp.flash, strength);
        onImpulseRef.current?.('flash', strength);
        break;
    }
  });

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;

    // Per-mapping cooldown keeps beat-mapped preset switches sane and
    // absorbs detector jitter. Impulse actions can retrigger faster.
    const cooldownFor = (action: TriggerActionKind): number =>
      action === 'nextPreset' ||
      action === 'prevPreset' ||
      action === 'randomPreset' ||
      action === 'randomPalette'
        ? 0.35
        : 0.12;

    const fireSource = (source: TriggerMapping['source'], strength: number, now: number) => {
      for (const mapping of mappingsRef.current) {
        if (!mapping.enabled || mapping.source !== source) continue;
        const last = lastFireRef.current[mapping.id] ?? 0;
        if (now - last < cooldownFor(mapping.action)) continue;
        lastFireRef.current[mapping.id] = now;
        fireActionRef.current(mapping.action, strength);
      }
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const m = metricsRef.current;
      if (!m) return;
      const now = performance.now() / 1000;

      // Beat: impact envelope snaps above the fire level, re-arms once it
      // rings down (hysteresis — no machine-gunning on one hit).
      if (beatArmedRef.current && m.impact > 0.55) {
        beatArmedRef.current = false;
        fireSource('beat', Math.min(1, m.impact), now);
      } else if (!beatArmedRef.current && m.impact < 0.28) {
        beatArmedRef.current = true;
      }

      // Bass hit: only the big ones — higher fire level, deeper re-arm.
      if (bassArmedRef.current && m.impact > 0.92 && m.bass > 0.5) {
        bassArmedRef.current = false;
        fireSource('bassHit', 1, now);
      } else if (!bassArmedRef.current && m.impact < 0.4) {
        bassArmedRef.current = true;
      }

      // Bar: fire on bar-phase wraparound (needs a confident BPM lock).
      if (m.bpm !== null) {
        if (prevBarPhaseRef.current > 0.8 && m.barPhase < 0.2) {
          fireSource('bar', 1, now);
        }
        prevBarPhaseRef.current = m.barPhase;
      }

      // Drop: same crossing the living palette uses for automatic kicks.
      if (dropArmedRef.current && m.dropEvent > 0.85) {
        dropArmedRef.current = false;
        fireSource('drop', 1, now);
      } else if (!dropArmedRef.current && m.dropEvent < 0.3) {
        dropArmedRef.current = true;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, metricsRef]);

  const handleMidiNoteRef = useRef((e: MidiNoteEvent) => {
    const now = performance.now() / 1000;
    // Velocity shapes the impulse: soft pads whisper, hard hits slam.
    const strength = 0.5 + e.velocity * 0.7;
    for (const mapping of mappingsRef.current) {
      if (!mapping.enabled || mapping.source !== 'midiNote') continue;
      if (mapping.midiNote !== null && mapping.midiNote !== undefined && mapping.midiNote !== e.note)
        continue;
      const last = lastFireRef.current[mapping.id] ?? 0;
      if (now - last < 0.05) continue;
      lastFireRef.current[mapping.id] = now;
      fireActionRef.current(mapping.action, strength);
    }
  });

  return { handleMidiNote: handleMidiNoteRef.current };
}
