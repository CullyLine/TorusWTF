'use client';

import { useEffect, useRef, useState, type JSX } from 'react';
import {
  TRIGGER_ACTIONS,
  TRIGGER_ACTION_LABELS,
  TRIGGER_SOURCES,
  TRIGGER_SOURCE_LABELS,
  createMapping,
  type TriggerMapping,
  type TriggerSourceKind,
  type TriggerActionKind,
} from '@/lib/triggerActions';
import type { UseWebMidiResult } from '@/lib/midi';
import { Button, Hint, Section, cx, inputClass } from '@/components/ui/controls';
import { CloseIcon } from '@/components/ui/icons';

interface TriggerPanelProps {
  mappings: TriggerMapping[];
  onChange: (next: TriggerMapping[]) => void;
  midi: UseWebMidiResult;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

function noteName(note: number): string {
  const name = NOTE_NAMES[note % 12]!;
  const octave = Math.floor(note / 12) - 1;
  return `${name}${octave}`;
}

// Trigger rows pack two selects on one line, so they use a tighter input.
const rowSelectClass = cx(inputClass, 'min-w-0 flex-1 px-2 py-1 text-xs');

export function TriggerPanel({ mappings, onChange, midi }: TriggerPanelProps): JSX.Element {
  const [learnId, setLearnId] = useState<string | null>(null);
  const learnIdRef = useRef(learnId);
  learnIdRef.current = learnId;
  const mappingsRef = useRef(mappings);
  mappingsRef.current = mappings;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Only fire when lastNote changes (not when arming against a stale lastNote).
  useEffect(() => {
    const id = learnIdRef.current;
    if (!id || !midi.lastNote) return;
    const note = midi.lastNote.note;
    setLearnId(null);
    onChangeRef.current(
      mappingsRef.current.map((m) => (m.id === id ? { ...m, midiNote: note } : m)),
    );
  }, [midi.lastNote]);

  const updateMapping = (id: string, patch: Partial<TriggerMapping>) => {
    onChange(mappings.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const removeMapping = (id: string) => {
    onChange(mappings.filter((m) => m.id !== id));
    if (learnId === id) setLearnId(null);
  };

  return (
    <Section title="Triggers">
      <Hint>
        A trigger fires one action when something happens in the music or on a MIDI note, such as a
        color kick on every drop. For continuous control, use Modulation below.
      </Hint>

      <div className="space-y-2">
        {mappings.map((mapping) => (
          <div
            key={mapping.id}
            className="space-y-2 rounded-md border border-torus-border bg-torus-bg p-2"
          >
            <div className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={mapping.enabled}
                onChange={(e) => updateMapping(mapping.id, { enabled: e.target.checked })}
                className="h-4 w-4 shrink-0 accent-torus-mid"
                aria-label="Enabled"
              />
              <select
                value={mapping.source}
                onChange={(e) =>
                  updateMapping(mapping.id, {
                    source: e.target.value as TriggerSourceKind,
                  })
                }
                className={rowSelectClass}
                aria-label="Source"
              >
                {TRIGGER_SOURCES.map((src) => (
                  <option key={src} value={src}>
                    {TRIGGER_SOURCE_LABELS[src]}
                  </option>
                ))}
              </select>
              <span className="shrink-0 text-torus-fg-faint">to</span>
              <select
                value={mapping.action}
                onChange={(e) =>
                  updateMapping(mapping.id, {
                    action: e.target.value as TriggerActionKind,
                  })
                }
                className={rowSelectClass}
                aria-label="Action"
              >
                {TRIGGER_ACTIONS.map((act) => (
                  <option key={act} value={act}>
                    {TRIGGER_ACTION_LABELS[act]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeMapping(mapping.id)}
                className="shrink-0 rounded p-1 text-torus-fg-faint hover:text-torus-bass"
                aria-label="Delete trigger"
              >
                <CloseIcon width="12" height="12" />
              </button>
            </div>

            {mapping.source === 'midiNote' ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-torus-fg-dim">Note</span>
                <input
                  type="number"
                  min={0}
                  max={127}
                  value={mapping.midiNote ?? ''}
                  placeholder="any"
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') {
                      updateMapping(mapping.id, { midiNote: null });
                      return;
                    }
                    const n = Number(raw);
                    if (!Number.isFinite(n)) return;
                    const clamped = Math.max(0, Math.min(127, Math.round(n)));
                    updateMapping(mapping.id, { midiNote: clamped });
                  }}
                  className={cx(inputClass, 'w-16 px-2 py-1 text-xs')}
                  aria-label="MIDI note number"
                />
                {mapping.midiNote != null ? (
                  <span className="text-torus-fg-faint">{noteName(mapping.midiNote)}</span>
                ) : null}
                <Button
                  size="sm"
                  onClick={() => setLearnId((prev) => (prev === mapping.id ? null : mapping.id))}
                >
                  {learnId === mapping.id ? 'Play a note' : 'Learn'}
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {mappings.length === 0 ? (
        <Hint>No triggers yet. A good first one is Drop to Color kick.</Hint>
      ) : null}

      <Button size="sm" onClick={() => onChange([...mappings, createMapping()])}>
        Add trigger
      </Button>

      <div className="border-t border-torus-border pt-3">
        {!midi.supported ? (
          <Hint>MIDI input needs Chrome or Edge.</Hint>
        ) : !midi.enabled ? (
          <div className="space-y-1">
            <Button size="sm" onClick={() => midi.requestAccess()}>
              Turn on MIDI input
            </Button>
            {midi.error ? <p className="text-xs text-torus-bass">{midi.error}</p> : null}
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block text-xs text-torus-fg-dim">
              Device
              <select
                value={midi.activeInputId ?? ''}
                onChange={(e) =>
                  midi.setActiveInputId(e.target.value === '' ? null : e.target.value)
                }
                className={cx(inputClass, 'mt-1 block w-full')}
              >
                <option value="">All devices</option>
                {midi.inputs.map((input) => (
                  <option key={input.id} value={input.id}>
                    {input.name}
                  </option>
                ))}
              </select>
            </label>
            {midi.lastNote ? (
              <Hint>
                Last note: {noteName(midi.lastNote.note)} ({midi.lastNote.note}), velocity{' '}
                {midi.lastNote.velocity.toFixed(2)}
              </Hint>
            ) : null}
          </div>
        )}
      </div>
    </Section>
  );
}
