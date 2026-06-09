import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, users } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * Polar webhook — grants the one-time Production License when an order is paid.
 *
 * Polar signs webhooks with the Standard Webhooks scheme. When
 * POLAR_WEBHOOK_SECRET is set we verify the signature; otherwise (local dev) we
 * accept unsigned payloads so the flow can be exercised end to end.
 */

function verifyStandardWebhook(
  rawBody: string,
  headers: Headers,
  secret: string,
): boolean {
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signature = headers.get('webhook-signature');
  if (!id || !timestamp || !signature) return false;

  const key = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  let keyBytes: Buffer;
  try {
    keyBytes = Buffer.from(key, 'base64');
  } catch {
    keyBytes = Buffer.from(key, 'utf8');
  }

  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = createHmac('sha256', keyBytes).update(signedContent).digest('base64');

  // The header is space-delimited "v1,<sig> v1,<sig>"; any match passes.
  for (const part of signature.split(' ')) {
    const sig = part.includes(',') ? part.split(',')[1] : part;
    if (!sig) continue;
    try {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      // try next
    }
  }
  return false;
}

interface PolarEvent {
  type?: string;
  data?: {
    id?: string;
    status?: string;
    paid?: boolean;
    metadata?: Record<string, unknown>;
    customer?: { email?: string | null } | null;
    checkout?: { metadata?: Record<string, unknown> } | null;
  };
}

function extractUserId(data: PolarEvent['data']): string | null {
  const m = (data?.metadata ?? data?.checkout?.metadata ?? {}) as Record<string, unknown>;
  const id = m.userId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

const GRANTING_EVENTS = new Set(['order.created', 'order.paid', 'order.updated']);

export async function POST(req: Request) {
  const rawBody = await req.text();
  const secret = process.env.POLAR_WEBHOOK_SECRET;

  if (secret) {
    if (!verifyStandardWebhook(rawBody, req.headers, secret)) {
      return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
    }
  }

  let event: PolarEvent;
  try {
    event = JSON.parse(rawBody) as PolarEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
  }

  if (!event.type || !GRANTING_EVENTS.has(event.type)) {
    return NextResponse.json({ ok: true, ignored: event.type ?? 'unknown' });
  }

  // For order.updated, only grant once the order is actually paid.
  if (event.type === 'order.updated' && !event.data?.paid && event.data?.status !== 'paid') {
    return NextResponse.json({ ok: true, ignored: 'unpaid' });
  }

  const userId = extractUserId(event.data);
  const orderId = event.data?.id ?? null;
  const email = event.data?.customer?.email ?? null;

  let target: { id: string } | undefined;
  if (userId) {
    [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  }
  if (!target && email) {
    [target] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
  }
  if (!target) {
    return NextResponse.json({ ok: true, unmatched: true });
  }

  await db
    .update(users)
    .set({ productionLicenseAt: Date.now(), productionLicenseOrderId: orderId })
    .where(eq(users.id, target.id));

  return NextResponse.json({ ok: true, granted: target.id });
}
