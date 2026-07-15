'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const ACTIVE_INPUT_KEY = 'torus-visualizer-midi-input';

export interface MidiNoteEvent {
  note: number;
  velocity: number;
  channel: number;
}

export interface UseWebMidiResult {
  /** navigator.requestMIDIAccess exists in this browser. */
  supported: boolean;
  /** Access granted and note listeners attached. */
  enabled: boolean;
  error: string | null;
  inputs: { id: string; name: string }[];
  /** null = listen to all inputs. Persisted to localStorage. */
  activeInputId: string | null;
  setActiveInputId: (id: string | null) => void;
  /** Most recent note-on — drives the "Learn" button in the UI. */
  lastNote: MidiNoteEvent | null;
  /** Ask for MIDI permission and start listening. Idempotent. */
  requestAccess: () => void;
}

function readPersistedInputId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(ACTIVE_INPUT_KEY);
  } catch {
    return null;
  }
}

function writePersistedInputId(id: string | null): void {
  try {
    if (id === null) {
      localStorage.removeItem(ACTIVE_INPUT_KEY);
    } else {
      localStorage.setItem(ACTIVE_INPUT_KEY, id);
    }
  } catch {
    // Storage unavailable — selection just won't survive reload.
  }
}

function listInputs(access: MIDIAccess): { id: string; name: string }[] {
  const result: { id: string; name: string }[] = [];
  access.inputs.forEach((input) => {
    result.push({ id: input.id, name: input.name ?? input.id });
  });
  return result;
}

export function useWebMidi(onNoteOn?: (e: MidiNoteEvent) => void): UseWebMidiResult {
  const supported =
    typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;

  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputs, setInputs] = useState<{ id: string; name: string }[]>([]);
  const [activeInputId, setActiveInputIdState] = useState<string | null>(readPersistedInputId);
  const [lastNote, setLastNote] = useState<MidiNoteEvent | null>(null);

  const onNoteOnRef = useRef(onNoteOn);
  onNoteOnRef.current = onNoteOn;

  const activeInputIdRef = useRef(activeInputId);
  activeInputIdRef.current = activeInputId;

  const accessRef = useRef<MIDIAccess | null>(null);
  const handlerRef = useRef<((event: MIDIMessageEvent) => void) | null>(null);

  const setActiveInputId = useCallback((id: string | null) => {
    setActiveInputIdState(id);
    writePersistedInputId(id);
  }, []);

  const attachHandlers = useCallback((access: MIDIAccess) => {
    const handler = (event: MIDIMessageEvent) => {
      const input = event.target as MIDIInput | null;
      const active = activeInputIdRef.current;
      if (active !== null && input && input.id !== active) return;

      const data = event.data;
      if (!data || data.length < 3) return;

      const status = data[0]!;
      const highNibble = status & 0xf0;
      const velocity = data[2]!;

      // Note-on with velocity > 0 only (0x9 + vel 0 is note-off).
      if (highNibble !== 0x90 || velocity === 0) return;

      const noteEvent: MidiNoteEvent = {
        note: data[1]!,
        velocity: velocity / 127,
        channel: status & 0x0f,
      };

      setLastNote(noteEvent);
      onNoteOnRef.current?.(noteEvent);
    };

    handlerRef.current = handler;
    access.inputs.forEach((input) => {
      input.onmidimessage = handler;
    });
    setInputs(listInputs(access));
  }, []);

  const detachHandlers = useCallback((access: MIDIAccess) => {
    access.inputs.forEach((input) => {
      input.onmidimessage = null;
    });
  }, []);

  const requestAccess = useCallback(() => {
    if (!supported) return;
    if (accessRef.current) {
      attachHandlers(accessRef.current);
      setEnabled(true);
      setError(null);
      return;
    }

    void navigator
      .requestMIDIAccess({ sysex: false })
      .then((access) => {
        accessRef.current = access;
        attachHandlers(access);

        access.onstatechange = () => {
          if (!accessRef.current) return;
          attachHandlers(accessRef.current);
        };

        setEnabled(true);
        setError(null);
      })
      .catch(() => {
        setError('MIDI access denied or unavailable.');
        setEnabled(false);
      });
  }, [supported, attachHandlers]);

  useEffect(() => {
    return () => {
      const access = accessRef.current;
      if (access) {
        detachHandlers(access);
        access.onstatechange = null;
      }
      accessRef.current = null;
      handlerRef.current = null;
    };
  }, [detachHandlers]);

  return {
    supported,
    enabled,
    error,
    inputs,
    activeInputId,
    setActiveInputId,
    lastNote,
    requestAccess,
  };
}
