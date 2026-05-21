import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { isoWeekBucket, isValidShareCode, normalizeShareCode } from '@torus/shared';
import { db, clips, votes } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { rateLimit, isFreshAccount } from '@/lib/rate-limit';

/** GET /api/clips/:shareCode/vote — vote count and whether the current user voted this week. */
export async function GET(req: Request, ctx: { params: Promise<{ shareCode: string }> }) {
  const { shareCode } = await ctx.params;
  if (!isValidShareCode(shareCode)) {
    return NextResponse.json({ error: 'Invalid share code.' }, { status: 400 });
  }
  const code = normalizeShareCode(shareCode);

  const [clip] = await db
    .select({ id: clips.id, deletedAt: clips.deletedAt })
    .from(clips)
    .where(eq(clips.shareCode, code))
    .limit(1);
  if (!clip || clip.deletedAt) {
    return NextResponse.json({ error: 'Clip not found.' }, { status: 404 });
  }

  const weekBucket = isoWeekBucket();
  const rows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(votes)
    .where(and(eq(votes.clipId, clip.id), eq(votes.weekBucket, weekBucket)));
  const count = rows[0]?.count ?? 0;

  const user = await getCurrentUser(req);
  let hasVoted = false;
  if (user) {
    const [mine] = await db
      .select({ clipId: votes.clipId })
      .from(votes)
      .where(
        and(eq(votes.clipId, clip.id), eq(votes.userId, user.id), eq(votes.weekBucket, weekBucket)),
      )
      .limit(1);
    hasVoted = Boolean(mine);
  }

  return NextResponse.json({ count, hasVoted, weekBucket });
}

/**
 * POST /api/clips/:shareCode/vote — cast your weekly vote on a clip.
 * DELETE /api/clips/:shareCode/vote — retract your vote (this week only).
 *
 * One vote per user per clip per ISO-week. Voting on a different week is allowed.
 */
export async function POST(req: Request, ctx: { params: Promise<{ shareCode: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in to vote.' }, { status: 401 });
  if (user.isBanned) return NextResponse.json({ error: 'Account suspended.' }, { status: 403 });

  const { shareCode } = await ctx.params;
  if (!isValidShareCode(shareCode)) {
    return NextResponse.json({ error: 'Invalid share code.' }, { status: 400 });
  }
  const code = normalizeShareCode(shareCode);

  const perHour = isFreshAccount(user.createdAt) ? 10 : 40;
  const rl = await rateLimit(`rl:vote:${user.id}`, perHour, 60 * 60);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Slow down a bit.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec ?? 60) } },
    );
  }

  const [clip] = await db
    .select({ id: clips.id, deletedAt: clips.deletedAt })
    .from(clips)
    .where(eq(clips.shareCode, code))
    .limit(1);
  if (!clip || clip.deletedAt) {
    return NextResponse.json({ error: 'Clip not found.' }, { status: 404 });
  }

  const weekBucket = isoWeekBucket();
  try {
    await db.insert(votes).values({ clipId: clip.id, userId: user.id, weekBucket });
  } catch {
    return NextResponse.json({ ok: true, alreadyVoted: true });
  }

  const rows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(votes)
    .where(and(eq(votes.clipId, clip.id), eq(votes.weekBucket, weekBucket)));
  const count = rows[0]?.count ?? 0;

  return NextResponse.json({ ok: true, weekBucket, count });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ shareCode: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in to vote.' }, { status: 401 });

  const { shareCode } = await ctx.params;
  if (!isValidShareCode(shareCode)) {
    return NextResponse.json({ error: 'Invalid share code.' }, { status: 400 });
  }
  const code = normalizeShareCode(shareCode);

  const [clip] = await db
    .select({ id: clips.id })
    .from(clips)
    .where(eq(clips.shareCode, code))
    .limit(1);
  if (!clip) return NextResponse.json({ error: 'Clip not found.' }, { status: 404 });

  const weekBucket = isoWeekBucket();
  await db
    .delete(votes)
    .where(
      and(eq(votes.clipId, clip.id), eq(votes.userId, user.id), eq(votes.weekBucket, weekBucket)),
    );

  return NextResponse.json({ ok: true });
}
