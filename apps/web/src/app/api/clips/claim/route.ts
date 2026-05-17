import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { db, clips } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { bustQuotaCache } from '@/lib/upload-limits';

const ClaimBody = z.object({
  claimTokens: z.array(z.string().min(1)).min(1).max(50),
});

/**
 * POST /api/clips/claim
 * Logged-in user provides a list of claim_tokens they have in their localStorage
 * (left over from anonymous uploads). Any matching anonymous clips get attached
 * to their account.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Sign in to claim clips.' }, { status: 401 });
  }

  const body = ClaimBody.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const claimed: { id: string; shareCode: string }[] = [];
  for (const token of body.data.claimTokens) {
    const result = await db
      .update(clips)
      .set({ ownerId: user.id, claimToken: null })
      .where(and(eq(clips.claimToken, token), isNull(clips.ownerId)))
      .returning({ id: clips.id, shareCode: clips.shareCode });
    if (result[0]) claimed.push(result[0]);
  }

  if (claimed.length > 0) {
    await bustQuotaCache(user.id);
  }

  return NextResponse.json({ claimed });
}
