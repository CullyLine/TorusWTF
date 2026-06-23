/**
 * midiLookup.ts — client helpers for the Transcriber's "Find existing MIDI"
 * mode. For popular songs, a human-made MIDI from BitMidi's archive is far more
 * accurate than browser transcription. Search + download both go through our
 * own /api/midi/* proxy (BitMidi has no CORS headers and we want to keep the
 * upstream host server-side).
 */

export interface MidiSearchResult {
  id: number;
  name: string;
  views: number;
  plays: number;
  /** Absolute BitMidi page URL (for attribution / "view source"). */
  pageUrl: string;
  /** 0..1 — how well this result matches the query (see `relevance`). */
  score: number;
}

export interface MidiSearchResponse {
  ok: boolean;
  query: string;
  results: MidiSearchResult[];
  error?: string;
}

const STOP = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'feat', 'ft', 'mid', 'midi',
]);

function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const t of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (t.length > 1 && !STOP.has(t)) out.add(t);
  }
  return out;
}

/** Fraction of significant query words present in the result name (0..1). */
export function relevance(query: string, name: string): number {
  const q = tokens(query);
  if (q.size === 0) return 0;
  const n = tokens(name);
  let hits = 0;
  for (const t of q) if (n.has(t)) hits++;
  return hits / q.size;
}

export type MatchTier = 'match' | 'maybe' | 'weak';

export function matchTier(score: number): MatchTier {
  if (score >= 0.6) return 'match';
  if (score >= 0.34) return 'maybe';
  return 'weak';
}

/**
 * Strip common YouTube-title cruft so a pasted video title searches cleanly.
 * (Same intent as the CLI's clean_title.)
 */
export function cleanSongQuery(raw: string): string {
  let s = raw;
  const patterns: RegExp[] = [
    /\[.*?\]/g,
    /\((?:[^()]*?(?:official|video|audio|lyric|hq|hd|4k|remaster|live)[^()]*?)\)/gi,
    /\bofficial\s+(?:music\s+)?video\b/gi,
    /\blyrics?\b/gi,
    /\bremaster(?:ed)?\b/gi,
    /\bHQ\b/g,
    /\bHD\b/g,
  ];
  for (const p of patterns) s = s.replace(p, '');
  return s.replace(/\s{2,}/g, ' ').replace(/^[\s\-|]+|[\s\-|]+$/g, '').trim();
}

export async function searchMidi(query: string, signal?: AbortSignal): Promise<MidiSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const res = await fetch(`/api/midi/search?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const data = (await res.json()) as MidiSearchResponse;
  if (!data.ok) throw new Error(data.error || 'Search failed');
  return data.results;
}

export async function fetchMidiBytes(id: number, signal?: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch(`/api/midi/download?id=${encodeURIComponent(String(id))}`, { signal });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return res.arrayBuffer();
}
