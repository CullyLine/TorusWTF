import { NextResponse } from 'next/server';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { sha256 } from '@oslojs/crypto/sha2';
import { encodeHexLowerCase } from '@oslojs/encoding';
import { db, magicLinks } from '@/lib/db';
import { buildSessionCookie, createSession, getOrCreateUserByEmail } from '@/lib/auth';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token) {
    return redirectToError('Missing sign-in token.');
  }

  const tokenHash = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
  const now = Date.now();
  const [link] = await db
    .select()
    .from(magicLinks)
    .where(
      and(
        eq(magicLinks.tokenHash, tokenHash),
        gt(magicLinks.expiresAt, now),
        isNull(magicLinks.usedAt),
      ),
    )
    .limit(1);

  if (!link) {
    return redirectToError('That sign-in link is invalid or has expired.');
  }

  // Mark used to prevent replay
  await db.update(magicLinks).set({ usedAt: now }).where(eq(magicLinks.id, link.id));

  const user = await getOrCreateUserByEmail(link.email);
  const session = await createSession(user.id);

  const headers = new Headers();
  headers.set('Set-Cookie', buildSessionCookie(session.token, session.expiresAt));
  headers.set('Location', '/?welcome=1');
  return new NextResponse(null, { status: 302, headers });
}

function redirectToError(message: string): NextResponse {
  const url = new URL('/signin', process.env.PUBLIC_URL ?? 'http://localhost:3000');
  url.searchParams.set('error', message);
  return NextResponse.redirect(url, 302);
}
