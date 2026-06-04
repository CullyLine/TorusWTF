import type { KeyLock } from './scales';

/**
 * project.ts — Conductor's serializable data model + reducer.
 *
 * Everything is tick-based (PPQ) so the project is tempo-independent and
 * MIDI-friendly. Pure module (no React/DOM); the React store lives in
 * store.tsx and persistence helpers are at the bottom of this file.
 */

export const PPQ = 480; // ticks per quarter note
export const MAX_TRACKS = 16; // one synth = 16 MIDI channels

export interface PresetRef {
  soundfontId: string;
  name: string;
  bankMSB: number;
  bankLSB: number;
  program: number;
}

export interface Note {
  id: string;
  startTick: number; // relative to the clip start
  durationTick: number;
  pitch: number; // MIDI note 0..127
  velocity: number; // 1..127
}

export interface Clip {
  id: string;
  name: string;
  startTick: number; // relative to the song start
  lengthTick: number;
  notes: Note[];
}

export interface Track {
  id: string;
  name: string;
  channel: number; // MIDI channel 0..15
  preset: PresetRef;
  color: string;
  mute: boolean;
  solo: boolean;
  volume: number; // 0..1
  clips: Clip[];
}

export interface ConductorProject {
  id: string;
  name: string;
  bpm: number;
  ppq: number;
  key: KeyLock;
  scaleLock: boolean;
  tracks: Track[];
}

export const TRACK_COLORS = [
  '#ff2d95',
  '#22d3ce',
  '#f7e08c',
  '#a78bfa',
  '#34d399',
  '#fb923c',
  '#60a5fa',
  '#f472b6',
] as const;

export function uid(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const DEFAULT_PRESET: PresetRef = {
  soundfontId: 'osrs',
  name: 'Patch 0',
  bankMSB: 0,
  bankLSB: 0,
  program: 0,
};

export function createTrack(index: number, preset: PresetRef = DEFAULT_PRESET): Track {
  return {
    id: uid('trk'),
    name: preset.name || `Track ${index + 1}`,
    channel: index % MAX_TRACKS,
    preset,
    color: TRACK_COLORS[index % TRACK_COLORS.length]!,
    mute: false,
    solo: false,
    volume: 0.85,
    clips: [],
  };
}

/**
 * Lowest MIDI channel (0..15) not already taken by an existing track. Keeps
 * every track on its own channel so presets, volume, mute and solo never
 * collide (array index alone collides after a remove + add).
 */
export function nextFreeChannel(tracks: Track[]): number {
  const used = new Set(tracks.map((t) => t.channel));
  for (let c = 0; c < MAX_TRACKS; c++) {
    if (!used.has(c)) return c;
  }
  return tracks.length % MAX_TRACKS;
}

export function createClip(startTick: number, lengthTick = PPQ * 4, name = 'Clip'): Clip {
  return { id: uid('clp'), name, startTick, lengthTick, notes: [] };
}

export function createDefaultProject(): ConductorProject {
  return {
    id: uid('prj'),
    name: 'Untitled',
    bpm: 120,
    ppq: PPQ,
    key: { tonic: 3, scale: 'minor' }, // D# minor — a nod to the user's example
    scaleLock: false,
    tracks: [createTrack(0)],
  };
}

// --- Reducer ----------------------------------------------------------------

export type ConductorAction =
  | { type: 'load'; project: ConductorProject }
  | { type: 'reset' }
  | { type: 'renameProject'; name: string }
  | { type: 'setBpm'; bpm: number }
  | { type: 'setKey'; key: Partial<KeyLock> }
  | { type: 'setScaleLock'; locked: boolean }
  | { type: 'addTrack'; preset?: PresetRef }
  | { type: 'insertTrack'; track: Track }
  | { type: 'removeTrack'; trackId: string }
  | { type: 'renameTrack'; trackId: string; name: string }
  | { type: 'setTrackPreset'; trackId: string; preset: PresetRef }
  | { type: 'setTrackColor'; trackId: string; color: string }
  | { type: 'setTrackVolume'; trackId: string; volume: number }
  | { type: 'toggleMute'; trackId: string }
  | { type: 'toggleSolo'; trackId: string }
  | { type: 'addClip'; trackId: string; startTick: number; lengthTick?: number; name?: string }
  | { type: 'removeClip'; trackId: string; clipId: string }
  | { type: 'duplicateClip'; trackId: string; clipId: string }
  | { type: 'moveClip'; trackId: string; clipId: string; toTrackId: string; startTick: number }
  | { type: 'resizeClip'; trackId: string; clipId: string; lengthTick: number }
  | { type: 'renameClip'; trackId: string; clipId: string; name: string }
  | { type: 'addNote'; trackId: string; clipId: string; note: Omit<Note, 'id'> }
  | { type: 'addNotes'; trackId: string; clipId: string; notes: Omit<Note, 'id'>[] }
  | { type: 'updateNote'; trackId: string; clipId: string; noteId: string; patch: Partial<Omit<Note, 'id'>> }
  | { type: 'removeNote'; trackId: string; clipId: string; noteId: string }
  | { type: 'replaceTracks'; tracks: Track[] };

function mapTrack(project: ConductorProject, trackId: string, fn: (t: Track) => Track): ConductorProject {
  return { ...project, tracks: project.tracks.map((t) => (t.id === trackId ? fn(t) : t)) };
}

function mapClip(track: Track, clipId: string, fn: (c: Clip) => Clip): Track {
  return { ...track, clips: track.clips.map((c) => (c.id === clipId ? fn(c) : c)) };
}

export function conductorReducer(project: ConductorProject, action: ConductorAction): ConductorProject {
  switch (action.type) {
    case 'load':
      return action.project;
    case 'reset':
      return createDefaultProject();
    case 'renameProject':
      return { ...project, name: action.name };
    case 'setBpm':
      return { ...project, bpm: Math.max(20, Math.min(300, Math.round(action.bpm))) };
    case 'setKey':
      return { ...project, key: { ...project.key, ...action.key } };
    case 'setScaleLock':
      return { ...project, scaleLock: action.locked };

    case 'addTrack': {
      if (project.tracks.length >= MAX_TRACKS) return project;
      const track = createTrack(project.tracks.length, action.preset);
      track.channel = nextFreeChannel(project.tracks);
      return { ...project, tracks: [...project.tracks, track] };
    }
    case 'insertTrack': {
      if (project.tracks.length >= MAX_TRACKS) return project;
      const track = { ...action.track, channel: nextFreeChannel(project.tracks) };
      return { ...project, tracks: [...project.tracks, track] };
    }
    case 'removeTrack':
      return { ...project, tracks: project.tracks.filter((t) => t.id !== action.trackId) };
    case 'renameTrack':
      return mapTrack(project, action.trackId, (t) => ({ ...t, name: action.name }));
    case 'setTrackPreset':
      return mapTrack(project, action.trackId, (t) => ({ ...t, preset: action.preset }));
    case 'setTrackColor':
      return mapTrack(project, action.trackId, (t) => ({ ...t, color: action.color }));
    case 'setTrackVolume':
      return mapTrack(project, action.trackId, (t) => ({
        ...t,
        volume: Math.max(0, Math.min(1, action.volume)),
      }));
    case 'toggleMute':
      return mapTrack(project, action.trackId, (t) => ({ ...t, mute: !t.mute }));
    case 'toggleSolo':
      return mapTrack(project, action.trackId, (t) => ({ ...t, solo: !t.solo }));

    case 'addClip':
      return mapTrack(project, action.trackId, (t) => ({
        ...t,
        clips: [...t.clips, createClip(action.startTick, action.lengthTick, action.name)],
      }));
    case 'removeClip':
      return mapTrack(project, action.trackId, (t) => ({
        ...t,
        clips: t.clips.filter((c) => c.id !== action.clipId),
      }));
    case 'duplicateClip':
      return mapTrack(project, action.trackId, (t) => {
        const src = t.clips.find((c) => c.id === action.clipId);
        if (!src) return t;
        const copy: Clip = {
          ...src,
          id: uid('clp'),
          startTick: src.startTick + src.lengthTick,
          notes: src.notes.map((n) => ({ ...n, id: uid('note') })),
        };
        return { ...t, clips: [...t.clips, copy] };
      });
    case 'moveClip': {
      const src = project.tracks
        .find((t) => t.id === action.trackId)
        ?.clips.find((c) => c.id === action.clipId);
      if (!src) return project;
      const moved: Clip = { ...src, startTick: Math.max(0, action.startTick) };
      const withoutSrc = mapTrack(project, action.trackId, (t) => ({
        ...t,
        clips: t.clips.filter((c) => c.id !== action.clipId),
      }));
      return mapTrack(withoutSrc, action.toTrackId, (t) => ({ ...t, clips: [...t.clips, moved] }));
    }
    case 'resizeClip':
      return mapTrack(project, action.trackId, (t) =>
        mapClip(t, action.clipId, (c) => ({ ...c, lengthTick: Math.max(PPQ / 4, action.lengthTick) })),
      );
    case 'renameClip':
      return mapTrack(project, action.trackId, (t) =>
        mapClip(t, action.clipId, (c) => ({ ...c, name: action.name })),
      );

    case 'addNote':
      return mapTrack(project, action.trackId, (t) =>
        mapClip(t, action.clipId, (c) => ({ ...c, notes: [...c.notes, { ...action.note, id: uid('note') }] })),
      );
    case 'addNotes':
      return mapTrack(project, action.trackId, (t) =>
        mapClip(t, action.clipId, (c) => ({
          ...c,
          notes: [...c.notes, ...action.notes.map((n) => ({ ...n, id: uid('note') }))],
        })),
      );
    case 'updateNote':
      return mapTrack(project, action.trackId, (t) =>
        mapClip(t, action.clipId, (c) => ({
          ...c,
          notes: c.notes.map((n) => (n.id === action.noteId ? { ...n, ...action.patch } : n)),
        })),
      );
    case 'removeNote':
      return mapTrack(project, action.trackId, (t) =>
        mapClip(t, action.clipId, (c) => ({ ...c, notes: c.notes.filter((n) => n.id !== action.noteId) })),
      );
    case 'replaceTracks':
      return { ...project, tracks: action.tracks };

    default:
      return project;
  }
}

// --- Persistence ------------------------------------------------------------

export const CONDUCTOR_STORAGE_KEY = 'torus.conductor.project.v1';

export function loadProject(): ConductorProject | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CONDUCTOR_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConductorProject;
    if (!parsed || !Array.isArray(parsed.tracks)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveProject(project: ConductorProject): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONDUCTOR_STORAGE_KEY, JSON.stringify(project));
  } catch {
    // ignore quota / serialization failures
  }
}

// --- Tick/time helpers ------------------------------------------------------

export function ticksToSeconds(ticks: number, bpm: number, ppq = PPQ): number {
  return (ticks / ppq) * (60 / bpm);
}

export function secondsToTicks(seconds: number, bpm: number, ppq = PPQ): number {
  return (seconds * bpm * ppq) / 60;
}

export function projectLengthTicks(project: ConductorProject): number {
  let max = 0;
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      max = Math.max(max, clip.startTick + clip.lengthTick);
    }
  }
  return max;
}

/** Tracks that should actually sound, honoring solo > mute precedence. */
export function audibleTrackIds(project: ConductorProject): Set<string> {
  const soloed = project.tracks.filter((t) => t.solo);
  const pool = soloed.length > 0 ? soloed : project.tracks;
  return new Set(pool.filter((t) => !t.mute).map((t) => t.id));
}
