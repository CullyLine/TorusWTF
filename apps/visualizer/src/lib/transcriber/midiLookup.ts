/**
 * midiLookup.ts — client helpers for the Transcriber's "Find existing MIDI"
 * mode. For popular songs, a human-made MIDI from BitMidi's archive is far more
 * accurate than browser transcription.
 *
 * We call BitMidi directly from the browser. Its search API and file downloads
 * both send `Access-Control-Allow-Origin: *`, so CORS isn't an issue — and
 * going direct is actually required: BitMidi sits behind Cloudflare, which
 * returns 403 for requests from datacenter IPs (e.g. Vercel's serverless
 * functions). The visitor's own IP isn't blocked, so the fetch must run
 * client-side.
 */

const BITMIDI = 'https://bitmidi.com';
const MAX_RESULTS = 15;

interface BitMidiRaw {
  id?: number;
  name?: string;
  views?: number;
  plays?: number;
  url?: string;
}

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
  const res = await fetch(
    `${BITMIDI}/api/midi/search?q=${encodeURIComponent(q)}&page=0`,
    { signal, headers: { Accept: 'application/json' } },
  );
  if (!res.ok) throw new Error(`Search failed (${res.status})`);

  const data = (await res.json()) as { result?: { results?: BitMidiRaw[] } };
  const raw = data.result?.results ?? [];

  return raw
    .filter((r): r is BitMidiRaw & { id: number } => typeof r.id === 'number')
    .slice(0, MAX_RESULTS)
    .map((r) => {
      const name = r.name ?? `MIDI ${r.id}`;
      return {
        id: r.id,
        name,
        views: r.views ?? 0,
        plays: r.plays ?? 0,
        pageUrl: r.url ? `${BITMIDI}${r.url}` : BITMIDI,
        score: relevance(q, name),
      };
    });
}

export async function fetchMidiBytes(id: number, signal?: AbortSignal): Promise<ArrayBuffer> {
  // `id` is a number, so the path can't be tampered with to reach another host.
  const res = await fetch(`${BITMIDI}/uploads/${id}.mid`, { signal });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);

  const buf = await res.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 4));
  // Standard MIDI File magic: "MThd".
  const isMidi = head[0] === 0x4d && head[1] === 0x54 && head[2] === 0x68 && head[3] === 0x64;
  if (!isMidi) throw new Error('That entry did not return a valid MIDI file.');
  return buf;
}
