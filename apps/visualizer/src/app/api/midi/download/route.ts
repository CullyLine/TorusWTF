import { NextResponse } from 'next/server';

/**
 * Proxies a single MIDI file from BitMidi by numeric id. Taking only an integer
 * id (not an arbitrary URL) keeps this from becoming an open proxy / SSRF hole:
 * we construct the upstream path ourselves. We also verify the payload is a real
 * Standard MIDI File (MThd header) before handing it back.
 *
 * GET /api/midi/download?id=<n>  ->  audio/midi bytes
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BITMIDI = 'https://bitmidi.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

export async function GET(req: Request) {
  const idParam = new URL(req.url).searchParams.get('id') ?? '';
  if (!/^\d+$/.test(idParam)) {
    return NextResponse.json(
      { ok: false, error: 'A numeric id is required.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const upstream = await fetch(`${BITMIDI}/uploads/${idParam}.mid`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(15_000),
    });
    if (!upstream.ok) throw new Error(`BitMidi responded ${upstream.status}`);

    const buf = await upstream.arrayBuffer();
    const head = new Uint8Array(buf.slice(0, 4));
    // "MThd"
    const isMidi = head[0] === 0x4d && head[1] === 0x54 && head[2] === 0x68 && head[3] === 0x64;
    if (!isMidi) throw new Error('Upstream did not return a MIDI file.');

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'audio/midi',
        'Content-Disposition': `attachment; filename="bitmidi-${idParam}.mid"`,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'MIDI download failed';
    return NextResponse.json(
      { ok: false, error: message },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
