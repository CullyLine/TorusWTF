import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, users } from '@/lib/db';
import {
  getCurrentUser,
  clearSessionCookie,
  invalidateSession,
  SESSION_COOKIE_NAME,
} from '@/lib/auth';
import { hasLicense } from '@/lib/license';

const DeleteBody = z.object({
  confirmHandle: z.string().min(1),
});

function readSessionToken(req: Request): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const p of header.split(';')) {
    const [k, ...rest] = p.trim().split('=');
    if (k === SESSION_COOKIE_NAME) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/** GET /api/auth/me — current session user for client UI (account menu, export gating). */
export async function GET(req: Request) {
  const discordAuth = Boolean(
    process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET,
  );
  const user = await getCurrentUser(req).catch(() => null);
  if (!user) {
    return NextResponse.json({ user: null, discordAuth });
  }
  return NextResponse.json({
    user: {
      id: user.id,
      handle: user.handle,
      avatarUrl: user.avatarUrl,
      hasLicense: hasLicense(user),
    },
    discordAuth,
  });
}

/** DELETE /api/auth/me — permanently delete the account (and its sessions). */
export async function DELETE(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  const parsed = DeleteBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  if (parsed.data.confirmHandle.toLowerCase() !== user.handle.toLowerCase()) {
    return NextResponse.json({ error: 'Handle confirmation does not match.' }, { status: 400 });
  }

  // Sessions cascade-delete via the FK on users; remove the user record.
  await db.delete(users).where(eq(users.id, user.id));

  const token = readSessionToken(req);
  if (token) await invalidateSession(token);

  return new NextResponse(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearSessionCookie(),
    },
  });
}
