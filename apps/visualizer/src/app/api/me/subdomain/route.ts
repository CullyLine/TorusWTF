import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, not } from 'drizzle-orm';
import { db, users } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { isReservedHandle } from '@/lib/reserved-handles';
import { hasLicense } from '@/lib/license';

const Body = z.object({
  subdomain: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, digits, and hyphens only.')
    .nullable(),
});

/** POST /api/me/subdomain — claim a vanity subdomain. A Production License perk. */
export async function POST(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  if (!hasLicense(user)) {
    return NextResponse.json(
      { error: 'Custom subdomains are a Production License perk.' },
      { status: 402 },
    );
  }

  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json(
      { error: body.error.flatten().fieldErrors.subdomain?.[0] ?? 'Invalid subdomain.' },
      { status: 400 },
    );
  }
  const sub = body.data.subdomain?.toLowerCase().trim() ?? null;
  if (sub && isReservedHandle(sub)) {
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
  return NextResponse.json({ ok: true, subdomain: sub });
}
