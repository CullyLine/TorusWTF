'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useConductor } from '@/lib/conductor/store';
import { conductorEngine } from '@/lib/conductor/engine';
import { PPQ, type Clip, type Note, type Track } from '@/lib/conductor/project';
import {
  NOTE_NAMES,
  SCALE_LABELS,
  isInScale,
  isTonic,
  nearestInScale,
  noteName,
  pitchClass,
} from '@/lib/conductor/scales';
import type { ConductorPlayback } from './useConductorPlayback';

const ROW_H = 16;
const KEY_W = 60;
const PR_PX_PER_QUARTER = 48;
const PR_PX_PER_TICK = PR_PX_PER_QUARTER / PPQ;
const TOP_PITCH = 108; // C8
const BOTTOM_PITCH = 21; // A0
const PITCH_COUNT = TOP_PITCH - BOTTOM_PITCH + 1;
const GRID_H = PITCH_COUNT * ROW_H;

const SNAP_OPTIONS: { label: string; ticks: number }[] = [
  { label: '1/1', ticks: PPQ * 4 },
  { label: '1/2', ticks: PPQ * 2 },
  { label: '1/4', ticks: PPQ },
  { label: '1/8', ticks: PPQ / 2 },
  { label: '1/16', ticks: PPQ / 4 },
];

const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);

interface NoteDrag {
  noteId: string;
  mode: 'move' | 'resize';
  startX: number;
  startY: number;
  origStart: number;
  origDur: number;
  origPitch: number;
  start: number;
  dur: number;
  pitch: number;
}

interface PianoRollProps {
  track: Track;
  clip: Clip;
  playback: ConductorPlayback;
  onClose: () => void;
}

function prTickToPx(tick: number): number {
  return tick * PR_PX_PER_TICK;
}
function prPxToTick(px: number): number {
  return px / PR_PX_PER_TICK;
}
function pitchToY(pitch: number): number {
  return (TOP_PITCH - pitch) * ROW_H;
}
function yToPitch(y: number): number {
  return TOP_PITCH - Math.floor(y / ROW_H);
}
function snapTo(tick: number, snap: number): number {
  return Math.round(tick / snap) * snap;
}

export function PianoRoll({ track, clip, playback, onClose }: PianoRollProps) {
  const { project, dispatch } = useConductor();
  const { key, scaleLock } = project;
  const [snap, setSnap] = useState(PPQ);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<NoteDrag | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const gridWidth = prTickToPx(clip.lengthTick);
  const barCount = Math.max(1, Math.ceil(clip.lengthTick / (PPQ * 4)));

  // Center the view around middle C on open and prime the instrument.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = pitchToY(72) - 120;
    conductorEngine.setChannelPreset(track.channel, track.preset);
  }, [track.channel, track.preset]);

  const preview = (pitch: number) => {
    conductorEngine.setChannelPreset(track.channel, track.preset);
    conductorEngine.noteOn(track.channel, pitch, 100);
    window.setTimeout(() => conductorEngine.noteOff(track.channel, pitch), 280);
  };

  const maybeSnapPitch = (pitch: number): number => {
    const p = Math.max(0, Math.min(127, pitch));
    return scaleLock ? nearestInScale(p, key) : p;
  };

  // Delete selected note with keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        dispatch({ type: 'removeNote', trackId: track.id, clipId: clip.id, noteId: selected });
        setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, dispatch, track.id, clip.id, onClose]);

  const onGridPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const tick = Math.max(0, Math.min(clip.lengthTick - snap, snapTo(prPxToTick(e.clientX - rect.left), snap)));
    const pitch = maybeSnapPitch(yToPitch(e.clientY - rect.top));
    dispatch({
      type: 'addNote',
      trackId: track.id,
      clipId: clip.id,
      note: { startTick: tick, durationTick: snap, pitch, velocity: 100 },
    });
    preview(pitch);
  };

  const onNotePointerDown = (
    e: ReactPointerEvent<HTMLDivElement>,
    note: Note,
    mode: 'move' | 'resize',
  ) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSelected(note.id);
    setDrag({
      noteId: note.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origStart: note.startTick,
      origDur: note.durationTick,
      origPitch: note.pitch,
      start: note.startTick,
      dur: note.durationTick,
      pitch: note.pitch,
    });
  };

  const onNotePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const deltaTick = prPxToTick(e.clientX - drag.startX);
    if (drag.mode === 'move') {
      const start = Math.max(0, Math.min(clip.lengthTick - drag.origDur, snapTo(drag.origStart + deltaTick, snap)));
      const pitch = maybeSnapPitch(drag.origPitch - Math.round((e.clientY - drag.startY) / ROW_H));
      if (pitch !== drag.pitch) preview(pitch);
      setDrag({ ...drag, start, pitch });
    } else {
      const dur = Math.max(snap, snapTo(drag.origDur + deltaTick, snap));
      setDrag({ ...drag, dur });
    }
  };

  const onNotePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    dispatch({
      type: 'updateNote',
      trackId: track.id,
      clipId: clip.id,
      noteId: drag.noteId,
      patch: { startTick: drag.start, durationTick: drag.dur, pitch: drag.pitch },
    });
    setDrag(null);
  };

  const rows = useMemo(() => {
    const out: number[] = [];
    for (let p = TOP_PITCH; p >= BOTTOM_PITCH; p--) out.push(p);
    return out;
  }, []);

  const noteDisplay = (note: Note) => {
    if (drag && drag.noteId === note.id) return { start: drag.start, dur: drag.dur, pitch: drag.pitch };
    return { start: note.startTick, dur: note.durationTick, pitch: note.pitch };
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-torus-bg/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-torus-border px-4 py-2.5">
        <span className="h-3 w-3 rounded-sm" style={{ background: track.color }} />
        <span className="text-sm font-medium">{clip.name}</span>
        <span className="text-xs text-torus-fg-faint">{track.name}</span>

        <div className="mx-1 h-5 w-px bg-torus-border" />

        <span
          className="rounded-md border border-torus-border bg-torus-surface px-2 py-1 text-xs text-torus-fg-dim"
          title="Set the key in the transport bar"
        >
          {NOTE_NAMES[key.tonic]} {SCALE_LABELS[key.scale]}
        </span>
        <button
          type="button"
          onClick={() => dispatch({ type: 'setScaleLock', locked: !scaleLock })}
          aria-pressed={scaleLock}
          className={`rounded-md border px-2 py-1 text-xs transition-colors ${
            scaleLock
              ? 'border-torus-mid/50 bg-torus-mid/15 text-torus-mid'
              : 'border-torus-border bg-torus-surface text-torus-fg-dim hover:text-torus-fg'
          }`}
        >
          Lock to scale
        </button>

        <div className="mx-1 h-5 w-px bg-torus-border" />

        <label className="flex items-center gap-1.5 text-xs text-torus-fg-faint">
          Snap
          <select
            value={snap}
            onChange={(e) => setSnap(Number(e.target.value))}
            className="rounded-md border border-torus-border bg-torus-surface px-1.5 py-1 text-xs text-torus-fg outline-none"
          >
            {SNAP_OPTIONS.map((o) => (
              <option key={o.label} value={o.ticks}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-md border border-torus-border bg-torus-surface px-3 py-1 text-xs text-torus-fg-dim hover:text-torus-fg"
        >
          Done
        </button>
      </div>

      {/* Editor */}
      <div ref={scrollRef} className="relative flex-1 overflow-auto">
        <div className="relative flex" style={{ height: GRID_H, width: KEY_W + gridWidth }}>
          {/* Piano keys */}
          <div className="sticky left-0 z-10 shrink-0" style={{ width: KEY_W }}>
            {rows.map((p) => {
              const black = BLACK_KEYS.has(pitchClass(p));
              const tonic = isTonic(p, key);
              const disabled = scaleLock && !isInScale(p, key);
              return (
                <div
                  key={p}
                  onPointerDown={() => {
                    if (!disabled) preview(p);
                  }}
                  className={`flex items-center justify-end border-b border-black/40 pr-1.5 text-[9px] ${
                    black ? 'bg-[#0c0d22] text-torus-fg-faint' : 'bg-[#15172e] text-torus-fg-dim'
                  } ${tonic ? 'font-semibold text-torus-mid' : ''} ${disabled ? 'opacity-35' : ''}`}
                  style={{ height: ROW_H }}
                >
                  {pitchClass(p) === 0 || tonic ? noteName(p) : ''}
                </div>
              );
            })}
          </div>

          {/* Note grid */}
          <div className="relative" style={{ width: gridWidth }} onPointerDown={onGridPointerDown}>
            {/* Scale-aware row tint */}
            {rows.map((p) => {
              const inScale = isInScale(p, key);
              const tonic = isTonic(p, key);
              const disabled = scaleLock && !inScale;
              const bg = tonic
                ? 'rgba(34,211,206,0.14)'
                : inScale
                  ? 'rgba(255,255,255,0.035)'
                  : disabled
                    ? 'rgba(0,0,0,0.5)'
                    : 'rgba(0,0,0,0.18)';
              return (
                <div
                  key={p}
                  className="pointer-events-none absolute left-0 right-0 border-b border-white/5"
                  style={{
                    top: pitchToY(p),
                    height: ROW_H,
                    backgroundColor: bg,
                    backgroundImage: disabled
                      ? 'repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0 4px, transparent 4px 8px)'
                      : undefined,
                  }}
                />
              );
            })}

            {/* Bar lines */}
            {Array.from({ length: barCount + 1 }, (_, i) => (
              <div
                key={i}
                className="pointer-events-none absolute top-0 bottom-0 w-px bg-white/15"
                style={{ left: prTickToPx(i * PPQ * 4) }}
              />
            ))}
            {Array.from({ length: barCount * 4 }, (_, i) => (
              <div
                key={`b${i}`}
                className="pointer-events-none absolute top-0 bottom-0 w-px bg-white/5"
                style={{ left: prTickToPx(i * PPQ) }}
              />
            ))}

            {/* Notes */}
            {clip.notes.map((note) => {
              const d = noteDisplay(note);
              const isSel = selected === note.id;
              return (
                <div
                  key={note.id}
                  onPointerDown={(e) => onNotePointerDown(e, note, 'move')}
                  onPointerMove={onNotePointerMove}
                  onPointerUp={onNotePointerUp}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: 'removeNote', trackId: track.id, clipId: clip.id, noteId: note.id });
                  }}
                  className={`absolute cursor-grab rounded-sm active:cursor-grabbing ${isSel ? 'z-10' : ''}`}
                  style={{
                    left: prTickToPx(d.start),
                    width: Math.max(4, prTickToPx(d.dur) - 1),
                    top: pitchToY(d.pitch) + 1,
                    height: ROW_H - 2,
                    background: track.color,
                    boxShadow: isSel ? '0 0 0 1px #fff' : undefined,
                  }}
                >
                  <div
                    onPointerDown={(e) => onNotePointerDown(e, note, 'resize')}
                    onPointerMove={onNotePointerMove}
                    onPointerUp={onNotePointerUp}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize"
                  />
                </div>
              );
            })}

            {/* Playhead (relative to clip start) */}
            {playback.isPlaying ? (
              <div
                className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-torus-high"
                style={{ left: prTickToPx(playback.playheadTick - clip.startTick) }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
