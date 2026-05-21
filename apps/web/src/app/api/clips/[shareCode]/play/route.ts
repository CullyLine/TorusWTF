import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db, clips } from '@/lib/db';
import { loadClipByShareCode } from '@/lib/clip-manage';
import { rateLimit } from '@/lib/rate-limit';

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

/** POST /api/clips/:shareCode/play — increment play count (rate-limited per IP + clip). */
export async function POST(req: Request, ctx: { params: Promise<{ shareCode: string }> }) {
  const { shareCode } = await ctx.params;
  const clip = await loadClipByShareCode(shareCode);
  if (!clip) {
    return NextResponse.json({ error: 'Clip not found.' }, { status: 404 });
  }

  const ip = clientIp(req);
  const rl = await rateLimit(`rl:play:${ip}:${clip.shareCode}`, 1, 6 * 60 * 60);
  if (!rl.ok) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  await db
    .update(clips)
    .set({ playCount: sql`${clips.playCount} + 1` })
    .where(eq(clips.id, clip.id));

  return NextResponse.json({ ok: true });
}
