import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sha256 } from '@oslojs/crypto/sha2';
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from '@oslojs/encoding';
import { generateId } from '@torus/shared';
import { db, magicLinks } from '@/lib/db';
import { sendMagicLinkEmail } from '@/lib/mail';

const Body = z.object({
  email: z.string().email().max(254),
});

const EXPIRES_MIN = 15;

/**
 * POST /api/auth/magic — request a sign-in email.
 * We always return 200 + a generic message to avoid leaking which emails are registered.
 */
export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: 'Invalid email.' }, { status: 400 });
  }
  const email = body.data.email.toLowerCase().trim();

  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = encodeBase32LowerCaseNoPadding(tokenBytes);
  const tokenHash = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));

  const expiresAt = Date.now() + EXPIRES_MIN * 60 * 1000;
  await db.insert(magicLinks).values({
    id: generateId(),
    email,
    tokenHash,
    expiresAt,
  });

  const baseUrl = process.env.PUBLIC_URL ?? 'http://localhost:3000';
  const loginUrl = `${baseUrl}/api/auth/magic/verify?token=${encodeURIComponent(token)}`;

  try {
    await sendMagicLinkEmail({ to: email, loginUrl, expiresMinutes: EXPIRES_MIN });
  } catch (err) {
    console.error('[auth] magic link send failed:', (err as Error).message);
    // Still return success to not leak email existence; the link is in our DB if SMTP comes back later.
  }

  return NextResponse.json({
    message: `If an account exists for ${email}, a sign-in link has been sent.`,
  });
}
