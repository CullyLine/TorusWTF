'use client';

import {
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useConductor } from '@/lib/conductor/store';
import { conductorEngine } from '@/lib/conductor/engine';
import {
  MAX_TRACKS,
  PPQ,
  createClip,
  createTrack,
  projectLengthTicks,
  uid,
  type Clip,
  type Note,
  type Track,
} from '@/lib/conductor/project';
import { barChordNotes } from '@/lib/conductor/harmony';
import {
  LANE_H,
  PX_PER_QUARTER,
  RULER_H,
  TICKS_PER_BAR,
  TRACK_HEADER_W,
  pxToTick,
  snapTick,
  tickToPx,
} from './layout';
import type { ConductorPlayback } from './useConductorPlayback';

const PX_PER_BAR = PX_PER_QUARTER * 4;
const LANE_BG = `repeating-linear-gradient(90deg, rgba(255,255,255,0.10) 0 1px, transparent 1px ${PX_PER_BAR}px), repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0 1px, transparent 1px ${PX_PER_QUARTER}px)`;

interface ArrangementViewProps {
  playback: ConductorPlayback;
  onEditClip: (trackId: string, clipId: string) => void;
  onNewInstrument: () => void;
  onChangeInstrument: (trackId: string) => void;
}

interface ClipDrag {
  clipId: string;
  trackId: string;
  toTrackId: string;
  mode: 'move' | 'resize';
  startX: number;
  origStart: number;
  origLength: number;
  start: number;
  length: number;
}

interface ClipMenu {
  trackId: string;
  clipId: string;
  x: number;
  y: number;
}

/** Inline silhouette of a clip's notes, scaled to fill the clip rectangle. */
function ClipSilhouette({ notes, lengthTick, color }: { notes: Note[]; lengthTick: number; color: string }) {
  if (notes.length === 0 || lengthTick <= 0) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const n of notes) {
    if (n.pitch < lo) lo = n.pitch;
    if (n.pitch > hi) hi = n.pitch;
  }
  const span = Math.max(1, hi - lo);
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-80"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      {notes.map((n) => {
        const x = (n.startTick / lengthTick) * 100;
        const w = Math.max(0.6, (n.durationTick / lengthTick) * 100);
        // Reserve vertical padding so notes never touch the clip edges.
        const y = 78 - ((n.pitch - lo) / span) * 64;
        return <rect key={n.id} x={x} y={y} width={w} height={5} rx={1} fill={color} />;
      })}
    </svg>
  );
}

export function ArrangementView({
  playback,
  onEditClip,
  onNewInstrument,
  onChangeInstrument,
}: ArrangementViewProps) {
  const { project, dispatch } = useConductor();
  const [selected, setSelected] = useState<{ trackId: string; clipId: string } | null>(null);
  const [drag, setDrag] = useState<ClipDrag | null>(null);
  const [menu, setMenu] = useState<ClipMenu | null>(null);
  const rulerDrag = useRef<{ startTick: number; moved: boolean } | null>(null);
  const rowsRef = useRef<HTMLDivElement>(null);

  const trackIndexAtY = (clientY: number): number => {
    const rows = rowsRef.current;
    if (!rows) return -1;
    const top = rows.getBoundingClientRect().top;
    const idx = Math.floor((clientY - top) / LANE_H);
    return Math.max(0, Math.min(project.tracks.length - 1, idx));
  };

  const totalTicks = useMemo(() => {
    const len = projectLengthTicks(project);
    const bars = Math.max(32, Math.ceil(len / TICKS_PER_BAR) + 4);
    return bars * TICKS_PER_BAR;
  }, [project]);

  const timelineWidth = tickToPx(totalTicks);
  const barCount = Math.ceil(totalTicks / TICKS_PER_BAR);

  // --- Clip drag (move / resize) -------------------------------------------
  const onClipPointerDown = (
    e: ReactPointerEvent<HTMLDivElement>,
    track: Track,
    clip: Clip,
    mode: 'move' | 'resize',
  ) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setMenu(null);
    setSelected({ trackId: track.id, clipId: clip.id });
    setDrag({
      clipId: clip.id,
      trackId: track.id,
      toTrackId: track.id,
      mode,
      startX: e.clientX,
      origStart: clip.startTick,
      origLength: clip.lengthTick,
      start: clip.startTick,
      length: clip.lengthTick,
    });
  };

  const onClipPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const deltaTick = pxToTick(e.clientX - drag.startX);
    if (drag.mode === 'move') {
      const start = Math.max(0, snapTick(drag.origStart + deltaTick, PPQ));
      const idx = trackIndexAtY(e.clientY);
      const toTrackId = idx >= 0 ? project.tracks[idx]!.id : drag.toTrackId;
      setDrag({ ...drag, start, toTrackId });
    } else {
      const length = Math.max(PPQ, snapTick(drag.origLength + deltaTick, PPQ));
      setDrag({ ...drag, length });
    }
  };

  const onClipPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    if (drag.mode === 'move' && (drag.start !== drag.origStart || drag.toTrackId !== drag.trackId)) {
      dispatch({
        type: 'moveClip',
        trackId: drag.trackId,
        clipId: drag.clipId,
        toTrackId: drag.toTrackId,
        startTick: drag.start,
      });
      setSelected({ trackId: drag.toTrackId, clipId: drag.clipId });
    } else if (drag.mode === 'resize' && drag.length !== drag.origLength) {
      dispatch({ type: 'resizeClip', trackId: drag.trackId, clipId: drag.clipId, lengthTick: drag.length });
    }
    setDrag(null);
  };

  const onLaneDoubleClick = (e: ReactMouseEvent<HTMLDivElement>, track: Track) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const tick = snapTick(pxToTick(e.clientX - rect.left), TICKS_PER_BAR);
    dispatch({ type: 'addClip', trackId: track.id, startTick: Math.max(0, tick), lengthTick: TICKS_PER_BAR, name: 'Clip' });
  };

  // --- Ruler: click to seek, drag to set loop region -----------------------
  const onRulerPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const tick = Math.max(0, snapTick(pxToTick(e.clientX - rect.left), PPQ));
    rulerDrag.current = { startTick: tick, moved: false };
  };

  const onRulerPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rd = rulerDrag.current;
    if (!rd) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const tick = Math.max(0, snapTick(pxToTick(e.clientX - rect.left), PPQ));
    if (Math.abs(tick - rd.startTick) >= PPQ) {
      rd.moved = true;
      playback.setLoopRegion(Math.min(rd.startTick, tick), Math.max(rd.startTick, tick));
      playback.setLoopEnabled(true);
    }
  };

  const onRulerPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rd = rulerDrag.current;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    if (rd && !rd.moved) playback.seek(rd.startTick);
    rulerDrag.current = null;
  };

  const clipDisplay = (clip: Clip) => {
    if (drag && drag.clipId === clip.id) {
      return { start: drag.start, length: drag.length };
    }
    return { start: clip.startTick, length: clip.lengthTick };
  };

  // --- Clip context menu ----------------------------------------------------
  const openMenu = (e: ReactMouseEvent<HTMLElement>, track: Track, clip: Clip) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected({ trackId: track.id, clipId: clip.id });
    setMenu({ trackId: track.id, clipId: clip.id, x: e.clientX, y: e.clientY });
  };

  const menuTarget = useMemo(() => {
    if (!menu) return null;
    const track = project.tracks.find((t) => t.id === menu.trackId);
    const clip = track?.clips.find((c) => c.id === menu.clipId);
    return track && clip ? { track, clip } : null;
  }, [menu, project.tracks]);

  const pullChordsToNewTrack = (track: Track, clip: Clip) => {
    if (project.tracks.length >= MAX_TRACKS) return;
    const triad = barChordNotes(clip, project.key, TICKS_PER_BAR);
    if (triad.length === 0) return;
    const newTrack = createTrack(project.tracks.length, track.preset);
    newTrack.name = `${track.name} chords`;
    const chordClip = createClip(clip.startTick, clip.lengthTick, `${clip.name} chords`);
    chordClip.notes = triad.map((n) => ({ ...n, id: uid('note') }));
    newTrack.clips = [chordClip];
    dispatch({ type: 'insertTrack', track: newTrack });
  };

  return (
    <>
    <div className="relative flex-1 overflow-auto bg-torus-bg">
      <div className="relative" style={{ width: TRACK_HEADER_W + timelineWidth }}>
        {/* Ruler row */}
        <div className="sticky top-0 z-20 flex" style={{ height: RULER_H }}>
          <div
            className="sticky left-0 z-30 shrink-0 border-b border-r border-torus-border bg-torus-bg"
            style={{ width: TRACK_HEADER_W }}
          />
          <div
            className="relative border-b border-torus-border bg-torus-bg"
            style={{ width: timelineWidth }}
            onPointerDown={onRulerPointerDown}
            onPointerMove={onRulerPointerMove}
            onPointerUp={onRulerPointerUp}
          >
            {Array.from({ length: barCount }, (_, i) => (
              <span
                key={i}
                className="absolute top-0 select-none pl-1 text-[10px] text-torus-fg-faint"
                style={{ left: i * PX_PER_BAR }}
              >
                {i + 1}
              </span>
            ))}
            {playback.loop.enabled ? (
              <div
                className="pointer-events-none absolute top-0 bottom-0 bg-torus-mid/20"
                style={{
                  left: tickToPx(playback.loop.startTick),
                  width: tickToPx(playback.loop.endTick - playback.loop.startTick),
                }}
              />
            ) : null}
          </div>
        </div>

        {/* Track rows */}
        <div ref={rowsRef}>
        {project.tracks.map((track) => {
          const isDropTarget =
            !!drag && drag.mode === 'move' && drag.toTrackId === track.id && drag.trackId !== track.id;
          return (
          <div key={track.id} className="flex" style={{ height: LANE_H }}>
            {/* Header */}
            <div
              className="sticky left-0 z-10 flex shrink-0 flex-col gap-1 border-b border-r border-torus-border bg-torus-bg px-2 py-1.5"
              style={{ width: TRACK_HEADER_W }}
            >
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: track.color }} />
                <input
                  value={track.name}
                  onChange={(e) => dispatch({ type: 'renameTrack', trackId: track.id, name: e.target.value })}
                  className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-xs font-medium outline-none hover:border-torus-border focus:border-torus-border-strong"
                />
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'removeTrack', trackId: track.id })}
                  aria-label="Remove track"
                  className="text-torus-fg-faint hover:text-torus-bass"
                >
                  {'\u2715'}
                </button>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onChangeInstrument(track.id)}
                  className="min-w-0 flex-1 truncate rounded border border-torus-border bg-torus-surface px-1.5 py-0.5 text-left text-[11px] text-torus-fg-dim hover:text-torus-fg"
                  title={track.preset.name}
                >
                  {track.preset.name}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const willMute = !track.mute;
                    dispatch({ type: 'toggleMute', trackId: track.id });
                    conductorEngine.setChannelVolume(track.channel, willMute ? 0 : track.volume);
                  }}
                  aria-pressed={track.mute}
                  className={`grid h-5 w-5 place-items-center rounded text-[10px] ${
                    track.mute ? 'bg-torus-bass/30 text-torus-bass' : 'bg-torus-surface text-torus-fg-faint hover:text-torus-fg'
                  }`}
                >
                  M
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'toggleSolo', trackId: track.id })}
                  aria-pressed={track.solo}
                  className={`grid h-5 w-5 place-items-center rounded text-[10px] ${
                    track.solo ? 'bg-torus-high/30 text-torus-high' : 'bg-torus-surface text-torus-fg-faint hover:text-torus-fg'
                  }`}
                >
                  S
                </button>
              </div>
            </div>

            {/* Lane */}
            <div
              className={`relative border-b border-torus-border ${
                isDropTarget ? 'ring-2 ring-inset ring-torus-mid/70' : ''
              }`}
              style={{ width: timelineWidth, backgroundImage: LANE_BG }}
              onDoubleClick={(e) => onLaneDoubleClick(e, track)}
            >
              {track.clips.map((clip) => {
                const { start, length } = clipDisplay(clip);
                const isSel = selected?.clipId === clip.id;
                return (
                  <div
                    key={clip.id}
                    onPointerDown={(e) => onClipPointerDown(e, track, clip, 'move')}
                    onPointerMove={onClipPointerMove}
                    onPointerUp={onClipPointerUp}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onEditClip(track.id, clip.id);
                    }}
                    onContextMenu={(e) => openMenu(e, track, clip)}
                    className={`group absolute top-1 bottom-1 cursor-grab overflow-hidden rounded-md border text-[11px] active:cursor-grabbing ${
                      isSel ? 'border-white/70' : 'border-white/20'
                    }`}
                    style={{
                      left: tickToPx(start),
                      width: Math.max(6, tickToPx(length)),
                      background: `${track.color}33`,
                      boxShadow: isSel ? `inset 0 0 0 1px ${track.color}` : undefined,
                    }}
                  >
                    <ClipSilhouette notes={clip.notes} lengthTick={clip.lengthTick} color={track.color} />
                    <span className="pointer-events-none absolute left-1.5 top-0.5 max-w-[85%] truncate text-torus-fg-dim drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                      {clip.name}
                    </span>
                    {isSel ? (
                      <div className="absolute right-0.5 top-0.5 flex gap-0.5">
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => openMenu(e, track, clip)}
                          aria-label="Clip options"
                          className="grid h-4 w-5 place-items-center rounded bg-black/50 text-[11px] leading-none text-torus-fg-dim hover:text-torus-fg"
                        >
                          {'\u22ef'}
                        </button>
                      </div>
                    ) : null}
                    <div
                      onPointerDown={(e) => onClipPointerDown(e, track, clip, 'resize')}
                      onPointerMove={onClipPointerMove}
                      onPointerUp={onClipPointerUp}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize"
                    />
                  </div>
                );
              })}
            </div>
          </div>
          );
        })}
        </div>

        {/* New instrument row */}
        <div className="flex" style={{ height: LANE_H }}>
          <div
            className="sticky left-0 z-10 flex shrink-0 items-center border-r border-torus-border bg-torus-bg px-2"
            style={{ width: TRACK_HEADER_W }}
          >
            <button
              type="button"
              onClick={onNewInstrument}
              className="w-full rounded-lg border border-dashed border-torus-border px-2 py-2 text-xs text-torus-fg-dim transition-colors hover:border-torus-border-strong hover:text-torus-fg"
            >
              + New Instrument
            </button>
          </div>
          <div style={{ width: timelineWidth }} />
        </div>

        {/* Playhead */}
        <div
          className="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-torus-high"
          style={{ left: TRACK_HEADER_W + tickToPx(playback.playheadTick) }}
        />
      </div>
    </div>

    {/* Clip context menu */}
    {menu && menuTarget ? (
      <>
        <div
          className="fixed inset-0 z-40"
          onPointerDown={() => setMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu(null);
          }}
        />
        <div
          className="fixed z-50 min-w-44 overflow-hidden rounded-lg border border-torus-border bg-torus-surface py-1 text-xs shadow-xl shadow-black/40"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            type="button"
            onClick={() => {
              dispatch({ type: 'duplicateClip', trackId: menu.trackId, clipId: menu.clipId });
              setMenu(null);
            }}
            className="block w-full px-3 py-1.5 text-left text-torus-fg-dim hover:bg-white/5 hover:text-torus-fg"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => {
              pullChordsToNewTrack(menuTarget.track, menuTarget.clip);
              setMenu(null);
            }}
            disabled={menuTarget.clip.notes.length === 0 || project.tracks.length >= MAX_TRACKS}
            className="block w-full px-3 py-1.5 text-left text-torus-fg-dim hover:bg-white/5 hover:text-torus-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-torus-fg-dim"
          >
            Pull chords to new track
          </button>
          <div className="my-1 h-px bg-torus-border" />
          <button
            type="button"
            onClick={() => {
              dispatch({ type: 'removeClip', trackId: menu.trackId, clipId: menu.clipId });
              setSelected(null);
              setMenu(null);
            }}
            className="block w-full px-3 py-1.5 text-left text-torus-bass/90 hover:bg-torus-bass/10 hover:text-torus-bass"
          >
            Delete
          </button>
        </div>
      </>
    ) : null}
    </>
  );
}
