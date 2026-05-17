import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { generateId, isValidShareCode, normalizeShareCode } from '@torus/shared';
import { db, clips, reports } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/request';

const Body = z.object({
  shareCode: z.string().min(1).max(16),
  reason: z.enum(['spam', 'copyright', 'illegal', 'harassment', 'other']),
  body: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`rl:report:${ip}`, 10, 60 * 60);
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many reports.' }, { status: 429 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid report.' }, { status: 400 });
  }
  if (!isValidShareCode(parsed.data.shareCode)) {
    return NextResponse.json({ error: 'Invalid share code.' }, { status: 400 });
  }
  const code = normalizeShareCode(parsed.data.shareCode);

  const [clip] = await db
    .select({ id: clips.id, ownerId: clips.ownerId })
    .from(clips)
    .where(eq(clips.shareCode, code))
    .limit(1);
  if (!clip) return NextResponse.json({ error: 'Clip not found.' }, { status: 404 });

  const reporter = await getCurrentUser(req).catch(() => null);

  await db.insert(reports).values({
    id: generateId(),
    clipId: clip.id,
    userId: clip.ownerId,
    reporterId: reporter?.id ?? null,
    reporterIp: ip,
    reason: parsed.data.reason,
    body: parsed.data.body?.trim() || null,
  });

  return NextResponse.json({ ok: true });
}
