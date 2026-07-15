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

const selectClass =
  'rounded-lg border border-torus-border bg-torus-bg px-2 py-1 text-xs text-torus-fg';
const pillButtonClass =
  'rounded-full border border-torus-border px-2 py-1 text-[10px] text-torus-fg-dim hover:border-torus-mid/40';

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
    <section className="rounded-xl border border-torus-border bg-torus-surface p-4">
      <h2 className="mb-3 text-sm font-medium text-torus-fg-dim">Triggers</h2>
      <p className="mb-3 text-[10px] text-torus-fg-faint">
        Fire visual moments from the music or a MIDI controller.
      </p>

      <div className="space-y-2">
        {mappings.map((mapping) => (
          <div
            key={mapping.id}
            className="space-y-2 rounded-lg border border-torus-border bg-torus-bg p-2"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={mapping.enabled}
                onChange={(e) => updateMapping(mapping.id, { enabled: e.target.checked })}
                className="accent-torus-mid"
                aria-label="Enabled"
              />
              <select
                value={mapping.source}
                onChange={(e) =>
                  updateMapping(mapping.id, {
                    source: e.target.value as TriggerSourceKind,
                  })
                }
                className={selectClass}
                aria-label="Source"
              >
                {TRIGGER_SOURCES.map((src) => (
                  <option key={src} value={src}>
                    {TRIGGER_SOURCE_LABELS[src]}
                  </option>
                ))}
              </select>
              <span className="text-torus-fg-faint">→</span>
              <select
                value={mapping.action}
                onChange={(e) =>
                  updateMapping(mapping.id, {
                    action: e.target.value as TriggerActionKind,
                  })
                }
                className={selectClass}
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
                className="ml-auto text-torus-fg-faint hover:text-torus-bass"
                aria-label="Delete trigger"
              >
                ✕
              </button>
            </div>

            {mapping.source === 'midiNote' ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <label className="text-torus-fg-dim">Note</label>
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
                  className={`${selectClass} w-16`}
                  aria-label="MIDI note number"
                />
                {mapping.midiNote != null ? (
                  <span className="text-torus-fg-faint">{noteName(mapping.midiNote)}</span>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    setLearnId((prev) => (prev === mapping.id ? null : mapping.id))
                  }
                  className={pillButtonClass}
                >
                  {learnId === mapping.id ? 'Listening…' : 'Learn'}
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {mappings.length === 0 ? (
        <p className="mb-2 text-[10px] text-torus-fg-faint">
          No triggers yet. Try Drop → Color kick.
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => onChange([...mappings, createMapping()])}
        className={`${pillButtonClass} mt-2`}
      >
        Add trigger
      </button>

      <div className="mt-3 border-t border-torus-border pt-3">
        {!midi.supported ? (
          <p className="text-[10px] text-torus-fg-faint">MIDI needs Chrome or Edge.</p>
        ) : !midi.enabled ? (
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => midi.requestAccess()}
              className={pillButtonClass}
            >
              Enable MIDI input
            </button>
            {midi.error ? (
              <p className="text-[10px] text-torus-bass">{midi.error}</p>
            ) : null}
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
                className={`${selectClass} mt-1 block w-full`}
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
              <p className="text-[10px] text-torus-fg-faint">
                Last note: {noteName(midi.lastNote.note)} ({midi.lastNote.note}) · vel{' '}
                {midi.lastNote.velocity.toFixed(2)}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
