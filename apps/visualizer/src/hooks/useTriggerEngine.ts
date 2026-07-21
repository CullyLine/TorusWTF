'use client';

import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { AudioMetrics, VisualImpulses } from '@torus/visualizers';
import type { MidiNoteEvent } from '@/lib/midi';
import { applyTriggerImpulse } from '@/lib/triggerActions';
import type { TriggerActionKind, TriggerMapping } from '@/lib/triggerActions';

export interface TriggerEngineActions {
  nextPreset: () => void;
  prevPreset: () => void;
  randomPreset: () => void;
  randomPalette: () => void;
  randomShader: () => void;
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
  const mappingsRef = useRef(mappings);
  mappingsRef.current = mappings;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const impulsesRef = useRef(impulses);
  impulsesRef.current = impulses;
  const onImpulseRef = useRef(onImpulse);
  onImpulseRef.current = onImpulse;

  const beatArmedRef = useRef(true);
  const kickArmedRef = useRef(true);
  const snareArmedRef = useRef(true);
  const hatArmedRef = useRef(true);
  const bassArmedRef = useRef(true);
  const dropArmedRef = useRef(true);
  const buildArmedRef = useRef(true);
  const vocalArmedRef = useRef(true);
  const leadArmedRef = useRef(true);
  const peakArmedRef = useRef(true);
  const echoArmedRef = useRef(true);
  const silenceArmedRef = useRef(true);
  const prevBarPhaseRef = useRef(0);
  const lastFireRef = useRef<Record<string, number>>({});

  const fireActionRef = useRef((action: TriggerActionKind, strength: number) => {
    const imp = impulsesRef.current;
    const a = actionsRef.current;
    const impulse = applyTriggerImpulse(imp, action, strength);
    if (impulse) {
      onImpulseRef.current?.(impulse.field, impulse.strength);
      return;
    }

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
      case 'randomShader':
        a.randomShader();
        break;
    }
  });

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;

    const cooldownFor = (action: TriggerActionKind): number =>
      action === 'nextPreset' ||
      action === 'prevPreset' ||
      action === 'randomPreset' ||
      action === 'randomPalette' ||
      action === 'randomShader'
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

      if (beatArmedRef.current && m.impact > 0.55) {
        beatArmedRef.current = false;
        fireSource('beat', Math.min(1, m.impact), now);
      } else if (!beatArmedRef.current && m.impact < 0.28) {
        beatArmedRef.current = true;
      }

      if (kickArmedRef.current && m.kick > 0.65) {
        kickArmedRef.current = false;
        fireSource('kick', Math.min(1, m.kick), now);
      } else if (!kickArmedRef.current && m.kick < 0.2) {
        kickArmedRef.current = true;
      }

      if (snareArmedRef.current && m.snare > 0.6) {
        snareArmedRef.current = false;
        fireSource('snare', Math.min(1, m.snare), now);
      } else if (!snareArmedRef.current && m.snare < 0.18) {
        snareArmedRef.current = true;
      }

      if (hatArmedRef.current && m.hat > 0.5) {
        hatArmedRef.current = false;
        fireSource('hat', Math.min(1, m.hat), now);
      } else if (!hatArmedRef.current && m.hat < 0.15) {
        hatArmedRef.current = true;
      }

      if (bassArmedRef.current && m.impact > 0.92 && m.bass > 0.5) {
        bassArmedRef.current = false;
        fireSource('bassHit', 1, now);
      } else if (!bassArmedRef.current && m.impact < 0.4) {
        bassArmedRef.current = true;
      }

      if (m.bpm !== null) {
        if (prevBarPhaseRef.current > 0.8 && m.barPhase < 0.2) {
          fireSource('bar', 1, now);
        }
        prevBarPhaseRef.current = m.barPhase;
      }

      if (dropArmedRef.current && m.dropEvent > 0.85) {
        dropArmedRef.current = false;
        fireSource('drop', 1, now);
      } else if (!dropArmedRef.current && m.dropEvent < 0.3) {
        dropArmedRef.current = true;
      }

      if (buildArmedRef.current && m.tension > 0.72) {
        buildArmedRef.current = false;
        fireSource('buildUp', Math.min(1, m.tension), now);
      } else if (!buildArmedRef.current && m.tension < 0.35) {
        buildArmedRef.current = true;
      }

      if (vocalArmedRef.current && m.vocalActivity > 0.55) {
        vocalArmedRef.current = false;
        fireSource('vocalIn', Math.min(1, m.vocalActivity), now);
      } else if (!vocalArmedRef.current && m.vocalActivity < 0.18) {
        vocalArmedRef.current = true;
      }

      if (leadArmedRef.current && m.leadActivity > 0.5) {
        leadArmedRef.current = false;
        fireSource('leadIn', Math.min(1, m.leadActivity), now);
      } else if (!leadArmedRef.current && m.leadActivity < 0.15) {
        leadArmedRef.current = true;
      }

      if (peakArmedRef.current && m.sectionLevel > 0.82) {
        peakArmedRef.current = false;
        fireSource('peak', 1, now);
      } else if (!peakArmedRef.current && m.sectionLevel < 0.5) {
        peakArmedRef.current = true;
      }

      if (echoArmedRef.current && m.echo > 0.45) {
        echoArmedRef.current = false;
        fireSource('echoPhrase', Math.min(1, m.echo), now);
      } else if (!echoArmedRef.current && m.echo < 0.12) {
        echoArmedRef.current = true;
      }

      if (silenceArmedRef.current && m.silence > 0.72 && m.energy < 0.2) {
        silenceArmedRef.current = false;
        fireSource('silenceBreak', Math.min(1, m.silence), now);
      } else if (!silenceArmedRef.current && m.silence < 0.35) {
        silenceArmedRef.current = true;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, metricsRef]);

  const handleMidiNoteRef = useRef((e: MidiNoteEvent) => {
    const now = performance.now() / 1000;
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
};
