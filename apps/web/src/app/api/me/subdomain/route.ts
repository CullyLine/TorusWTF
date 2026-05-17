import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, not, sql } from 'drizzle-orm';
import { db, users } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { hasPerk } from '@/lib/tier-perks';

const Body = z.object({
  subdomain: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, digits, and hyphens only.')
    .nullable(),
});

const RESERVED = new Set([
  'www',
  'admin',
  'api',
  'media',
  'static',
  'mail',
  'help',
  'support',
  'about',
  'signin',
  'signup',
  'login',
  'auth',
  'charts',
  'moderation',
  'embed',
  'u',
]);

export async function POST(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  if (!hasPerk(user.tier, 'custom_subdomain')) {
    return NextResponse.json({ error: 'Custom subdomains are a Supporter perk.' }, { status: 402 });
  }

  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json(
      { error: body.error.flatten().fieldErrors.subdomain?.[0] ?? 'Invalid subdomain.' },
      { status: 400 },
    );
  }
  const sub = body.data.subdomain?.toLowerCase().trim() ?? null;
  if (sub && RESERVED.has(sub)) {
    return NextResponse.json({ error: 'That subdomain is reserved.' }, { status: 409 });
  }

  if (sub) {
    const conflict = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.customSubdomain, sub), not(eq(users.id, user.id))))
      .limit(1);
    if (conflict.length > 0) {
      return NextResponse.json({ error: 'That subdomain is taken.' }, { status: 409 });
    }
  }

  await db.update(users).set({ customSubdomain: sub }).where(eq(users.id, user.id));
  void sql; // referenced only in the imported drizzle module
  return NextResponse.json({ ok: true, subdomain: sub });
}
