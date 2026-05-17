import { NextResponse } from 'next/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { generateId, isValidShareCode, normalizeShareCode } from '@torus/shared';
import { db, clips, comments, users } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { isFreshAccount, rateLimit } from '@/lib/rate-limit';

const MAX_BODY = 800;

export async function GET(_req: Request, ctx: { params: Promise<{ shareCode: string }> }) {
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

  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      author: { handle: users.handle, avatarUrl: users.avatarUrl, tier: users.tier },
    })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(and(eq(comments.clipId, clip.id), isNull(comments.deletedAt)))
    .orderBy(desc(comments.createdAt))
    .limit(200);

  return NextResponse.json({ comments: rows });
}

export async function POST(req: Request, ctx: { params: Promise<{ shareCode: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in to comment.' }, { status: 401 });
  if (user.isBanned) return NextResponse.json({ error: 'Account suspended.' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { body?: unknown } | null;
  const text = typeof body?.body === 'string' ? body.body.trim() : '';
  if (!text || text.length > MAX_BODY) {
    return NextResponse.json(
      { error: `Comment must be 1–${MAX_BODY} characters.` },
      { status: 400 },
    );
  }

  const perHour = isFreshAccount(user.createdAt) ? 6 : 30;
  const rl = await rateLimit(`rl:cmt:${user.id}`, perHour, 60 * 60);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Slow down a bit.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec ?? 60) } },
    );
  }

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

  const id = generateId();
  await db.insert(comments).values({ id, clipId: clip.id, userId: user.id, body: text });

  return NextResponse.json({
    id,
    body: text,
    createdAt: Date.now(),
    author: { handle: user.handle, avatarUrl: user.avatarUrl, tier: user.tier },
  });
}
