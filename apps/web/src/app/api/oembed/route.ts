import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, clips } from '@/lib/db';
import { storage } from '@/lib/storage';
import { isValidShareCode, normalizeShareCode } from '@torus/shared';

/**
 * GET /api/oembed?url=<canonical clip URL>
 * Implements https://oembed.com so Discord, Reddit, Notion etc. embed an
 * inline player instead of just a link card.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const url = params.get('url');
  if (!url) {
    return NextResponse.json({ error: 'Missing `url` parameter.' }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL.' }, { status: 400 });
  }

  const segment = parsed.pathname.slice(1).split('/')[0] ?? '';
  if (!isValidShareCode(segment)) {
    return NextResponse.json({ error: 'URL does not look like a torus.fm clip.' }, { status: 404 });
  }
  const code = normalizeShareCode(segment);

  const [clip] = await db.select().from(clips).where(eq(clips.shareCode, code)).limit(1);
  if (!clip || clip.deletedAt) {
    return NextResponse.json({ error: 'Clip not found.' }, { status: 404 });
  }

  const ogUrl = clip.ogImageKey ? storage.publicUrl(clip.ogImageKey) : '';
  const html = `<iframe src="${parsed.origin}/embed/${code}" width="100%" height="180" frameborder="0" allow="autoplay" allowfullscreen></iframe>`;

  return NextResponse.json({
    version: '1.0',
    type: 'rich',
    provider_name: 'torus.fm',
    provider_url: parsed.origin,
    title: clip.title ?? 'untitled',
    author_name: 'torus.fm',
    html,
    width: 480,
    height: 180,
    thumbnail_url: ogUrl,
    thumbnail_width: 1200,
    thumbnail_height: 630,
  });
}
