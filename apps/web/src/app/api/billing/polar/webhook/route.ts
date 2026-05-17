import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, users } from '@/lib/db';

/**
 * Polar.sh webhook receiver. Activates / deactivates the Supporter tier on
 * subscription lifecycle events.
 *
 * Configuration:
 *   POLAR_WEBHOOK_SECRET — the secret shown in the Polar dashboard for this
 *                          webhook endpoint. Used to verify request signatures.
 *
 * Customer association:
 *   Polar customers can be created with a custom `external_id`. We set that to
 *   our internal user.id during checkout (see /api/billing/polar/checkout).
 *   Webhook payloads then carry that id back to us.
 */

const TRACKED_EVENTS = new Set([
  'subscription.created',
  'subscription.active',
  'subscription.updated',
  'subscription.renewed',
  'subscription.canceled',
  'subscription.revoked',
]);

interface PolarSubscriptionPayload {
  type?: string;
  data?: {
    id?: string;
    status?: string;
    customer_id?: string;
    customer?: { id?: string; external_id?: string | null };
    current_period_end?: string;
    started_at?: string;
    metadata?: Record<string, string>;
  };
}

export async function POST(req: Request) {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'Polar webhook is not configured on this instance.' },
      { status: 501 },
    );
  }

  const raw = await req.text();
  const signature = req.headers.get('webhook-signature') ?? req.headers.get('x-polar-signature');
  if (!signature || !verifySignature(raw, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  const event = JSON.parse(raw) as PolarSubscriptionPayload;
  if (!event.type || !TRACKED_EVENTS.has(event.type)) {
    return NextResponse.json({ ignored: event.type ?? 'unknown' });
  }

  const externalId = event.data?.customer?.external_id ?? event.data?.metadata?.user_id ?? null;
  if (!externalId) {
    return NextResponse.json(
      { error: 'No external_id / user_id metadata on subscription.' },
      { status: 422 },
    );
  }

  const [target] = await db.select().from(users).where(eq(users.id, externalId)).limit(1);
  if (!target) {
    return NextResponse.json({ error: 'Unknown user.' }, { status: 404 });
  }

  const isActive =
    event.data?.status === 'active' ||
    event.type === 'subscription.renewed' ||
    event.type === 'subscription.active';
  const expiresAtMs = event.data?.current_period_end
    ? Date.parse(event.data.current_period_end)
    : null;

  if (isActive) {
    await db
      .update(users)
      .set({
        tier: 'supporter',
        tierStartedAt: target.tierStartedAt ?? Date.now(),
        tierExpiresAt: expiresAtMs,
        paymentCustomerId: event.data?.customer_id ?? target.paymentCustomerId,
      })
      .where(eq(users.id, target.id));
  } else {
    // canceled / revoked
    await db
      .update(users)
      .set({ tier: 'free', tierExpiresAt: Date.now() })
      .where(eq(users.id, target.id));
  }

  return NextResponse.json({ ok: true, tier: isActive ? 'supporter' : 'free' });
}

function verifySignature(payload: string, signature: string, secret: string): boolean {
  try {
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    const sig = signature.startsWith('sha256=') ? signature.slice('sha256='.length) : signature;
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(sig, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
