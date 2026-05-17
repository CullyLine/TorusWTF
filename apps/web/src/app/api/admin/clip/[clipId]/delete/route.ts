import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { generateId } from '@torus/shared';
import { db, clips, moderationLog } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

const Body = z.object({
  publicReason: z.string().min(3).max(280),
});

/**
 * Soft-deletes a clip and writes a public moderation log entry.
 * Clip rows are kept so share codes remain reserved.
 */
export async function POST(req: Request, ctx: { params: Promise<{ clipId: string }> }) {
  const user = await getCurrentUser(req);
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: 'Invalid body.' }, { status: 400 });

  const { clipId } = await ctx.params;
  const [clip] = await db.select().from(clips).where(eq(clips.id, clipId)).limit(1);
  if (!clip) return NextResponse.json({ error: 'Clip not found.' }, { status: 404 });

  const now = Date.now();
  await db
    .update(clips)
    .set({ deletedAt: now, deletedReason: body.data.publicReason })
    .where(eq(clips.id, clipId));

  await db.insert(moderationLog).values({
    id: generateId(),
    action: 'clip_removed',
    targetRef: `clip:${clip.shareCode}`,
    publicReason: body.data.publicReason,
    actorId: user.id,
  });

  return NextResponse.json({ ok: true });
}
