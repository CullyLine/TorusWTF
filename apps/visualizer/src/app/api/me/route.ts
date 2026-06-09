import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, not, sql } from 'drizzle-orm';
import { generateId } from '@torus/shared';
import { db, users, handleHistory } from '@/lib/db';
import { getCurrentUser, isValidHandle } from '@/lib/auth';
import { isReservedHandle } from '@/lib/reserved-handles';

const PatchBody = z.object({
  bio: z.string().max(500).nullable().optional(),
  avatarUrl: z.string().url().max(2048).nullable().optional(),
  handle: z.string().min(3).max(32).optional(),
});

/** PATCH /api/me — update profile fields for the signed-in user. */
export async function PATCH(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const updates: { bio?: string | null; avatarUrl?: string | null; handle?: string } = {};

  if (typeof parsed.data.bio !== 'undefined') {
    const trimmed = parsed.data.bio?.trim() ?? '';
    updates.bio = trimmed || null;
  }

  if (typeof parsed.data.avatarUrl !== 'undefined') {
    updates.avatarUrl = parsed.data.avatarUrl;
  }

  if (typeof parsed.data.handle !== 'undefined') {
    const next = parsed.data.handle.toLowerCase().trim();
    if (!isValidHandle(next)) {
      return NextResponse.json(
        { error: 'Handle must be 3–32 characters: lowercase letters, digits, _ or -.' },
        { status: 400 },
      );
    }
    if (isReservedHandle(next)) {
      return NextResponse.json({ error: 'That handle is reserved.' }, { status: 409 });
    }
    if (next !== user.handle.toLowerCase()) {
      const conflict = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(sql`lower(${users.handle})`, next), not(eq(users.id, user.id))))
        .limit(1);
      if (conflict.length > 0) {
        return NextResponse.json({ error: 'That handle is taken.' }, { status: 409 });
      }

      const historyConflict = await db
        .select({ id: handleHistory.id })
        .from(handleHistory)
        .where(eq(sql`lower(${handleHistory.oldHandle})`, next))
        .limit(1);
      if (historyConflict.length > 0) {
        return NextResponse.json({ error: 'That handle is taken.' }, { status: 409 });
      }

      await db.insert(handleHistory).values({
        id: generateId(),
        oldHandle: user.handle,
        userId: user.id,
      });
      updates.handle = next;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update.' }, { status: 400 });
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, user.id))
    .returning({
      id: users.id,
      handle: users.handle,
      email: users.email,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      customSubdomain: users.customSubdomain,
    });

  return NextResponse.json({ user: updated });
}
