import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { revokeApiKey } from '@/lib/api-keys';

export const dynamic = 'force-dynamic';

/** DELETE /api/keys/:id — revoke a key (irreversible). */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  const { id } = await ctx.params;
  const ok = revokeApiKey(user.id, id);
  if (!ok) return NextResponse.json({ error: 'Key not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
