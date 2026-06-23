import { NextResponse } from 'next/server';
import { relevance, type MidiSearchResult } from '@/lib/transcriber/midiLookup';

/**
 * Proxies BitMidi's search API for the Transcriber's "Find existing MIDI" mode.
 * BitMidi sends no CORS headers, so the browser can't call it directly; we also
 * keep the upstream host server-side. Results are annotated with a relevance
 * score (vs the query) so the UI can flag confident matches.
 *
 * GET /api/midi/search?q=<keyword>
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BITMIDI = 'https://bitmidi.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const MAX_RESULTS = 15;

interface BitMidiRaw {
  id?: number;
  name?: string;
  views?: number;
  plays?: number;
  url?: string;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() ?? '';

  if (q.length < 2) {
    return NextResponse.json(
      { ok: true, query: q, results: [] },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const upstream = await fetch(
      `${BITMIDI}/api/midi/search?q=${encodeURIComponent(q)}&page=0`,
      { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(12_000) },
    );
    if (!upstream.ok) throw new Error(`BitMidi responded ${upstream.status}`);

    const json = (await upstream.json()) as { result?: { results?: BitMidiRaw[] } };
    const raw = json.result?.results ?? [];

    const results: MidiSearchResult[] = raw
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

    return NextResponse.json(
      { ok: true, query: q, results },
      { headers: { 'Cache-Control': 'public, max-age=300' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'MIDI search failed';
    return NextResponse.json(
      { ok: false, query: q, results: [], error: message },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
