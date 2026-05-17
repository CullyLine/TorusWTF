import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db, users, follows } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(req: Request, ctx: { params: Promise<{ handle: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in to follow.' }, { status: 401 });

  const { handle } = await ctx.params;
  const rl = await rateLimit(`rl:fol:${user.id}`, 60, 60 * 60);
  if (!rl.ok) return NextResponse.json({ error: 'Slow down.' }, { status: 429 });

  const [target] = await db
    .select({ id: users.id, handle: users.handle })
    .from(users)
    .where(eq(sql`lower(${users.handle})`, handle.toLowerCase()))
    .limit(1);
  if (!target) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  if (target.id === user.id) {
    return NextResponse.json({ error: 'You cannot follow yourself.' }, { status: 400 });
  }

  try {
    await db.insert(follows).values({ followerId: user.id, followeeId: target.id });
  } catch {
    // already following
  }
  return NextResponse.json({ ok: true, following: true });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ handle: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in.' }, { status: 401 });

  const { handle } = await ctx.params;
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(sql`lower(${users.handle})`, handle.toLowerCase()))
    .limit(1);
  if (!target) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

  await db
    .delete(follows)
    .where(and(eq(follows.followerId, user.id), eq(follows.followeeId, target.id)));

  return NextResponse.json({ ok: true, following: false });
}
