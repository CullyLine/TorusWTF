import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { generateId } from '@torus/shared';
import { db, users, clips } from '@/lib/db';
import {
  getCurrentUser,
  clearSessionCookie,
  invalidateSession,
  SESSION_COOKIE_NAME,
} from '@/lib/auth';
import { deleteClipStorageKeys } from '@/lib/clip-storage';
import { sendAnonymizeRescueEmail } from '@/lib/mail';

const DeleteBody = z.object({
  mode: z.enum(['anonymize', 'delete_all']),
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

/** GET /api/auth/me — current session user for client UI (upload dialog, etc.). */
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
    },
    discordAuth,
  });
}

/**
 * DELETE /api/auth/me — delete account.
 * anonymize: detach clips (assign claim tokens), email rescue links, delete user.
 * delete_all: wipe clips, storage, then delete user.
 */
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

  const publicUrl = (process.env.PUBLIC_URL ?? 'http://localhost:3000').replace(/\/$/, '');

  if (parsed.data.mode === 'anonymize') {
    const owned = await db
      .select({
        id: clips.id,
        shareCode: clips.shareCode,
        claimToken: clips.claimToken,
      })
      .from(clips)
      .where(eq(clips.ownerId, user.id));

    const rescueLinks: { shareCode: string; url: string }[] = [];

    for (const clip of owned) {
      let token = clip.claimToken;
      if (!token) {
        token = `clm_${generateId()}`;
        await db.update(clips).set({ claimToken: token }).where(eq(clips.id, clip.id));
      }
      rescueLinks.push({
        shareCode: clip.shareCode,
        url: `${publicUrl}/${clip.shareCode}?claim=${encodeURIComponent(token)}`,
      });
    }

    if (user.email && rescueLinks.length > 0) {
      await sendAnonymizeRescueEmail({
        to: user.email,
        links: rescueLinks,
      });
    }

    await db.delete(users).where(eq(users.id, user.id));
  } else {
    const owned = await db.select().from(clips).where(eq(clips.ownerId, user.id));
    for (const clip of owned) {
      await deleteClipStorageKeys(clip);
    }
    await db.delete(clips).where(eq(clips.ownerId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  }

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
