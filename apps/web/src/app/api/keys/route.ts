import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { createApiKey, listApiKeys } from '@/lib/api-keys';

export const dynamic = 'force-dynamic';

const CreateBody = z.object({
  name: z.string().min(1).max(80),
  dailySpendCap: z.number().int().positive().nullable().optional(),
  rateLimitPerMin: z.number().int().positive().max(6000).nullable().optional(),
});

/** GET /api/keys — list the signed-in user's keys (no secrets). */
export async function GET(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  return NextResponse.json({ keys: listApiKeys(user.id) });
}

/** POST /api/keys — mint a new key. Plaintext returned ONCE. */
export async function POST(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const created = createApiKey({
    userId: user.id,
    name: parsed.data.name,
    dailySpendCap: parsed.data.dailySpendCap ?? null,
    rateLimitPerMin: parsed.data.rateLimitPerMin ?? null,
  });

  return NextResponse.json({ key: created }, { status: 201 });
}
