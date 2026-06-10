import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, users } from '@/lib/db';
import {
  ensureAccountLicensed,
  extractPolarUserId,
  resolveLicenseUser,
  type PolarMetadataCarrier,
} from '@/lib/license-grant';

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
  data?: PolarMetadataCarrier & {
    status?: string;
    paid?: boolean;
    customer?: { email?: string | null; metadata?: Record<string, unknown> | null } | null;
    checkout?: { metadata?: Record<string, unknown> | null } | null;
  };
}

const GRANTING_EVENTS = new Set([
  'order.paid',
  'order.created',
  'order.updated',
  'checkout.updated',
]);

function isPaidOrder(data: PolarEvent['data']): boolean {
  if (!data) return false;
  return data.paid === true || data.status === 'paid';
}

function isSucceededCheckout(data: PolarEvent['data']): boolean {
  return data?.status === 'succeeded';
}

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

  if (event.type === 'checkout.updated' && !isSucceededCheckout(event.data)) {
    return NextResponse.json({ ok: true, ignored: 'checkout-not-succeeded' });
  }

  if (event.type.startsWith('order.') && event.type !== 'order.paid' && !isPaidOrder(event.data)) {
    return NextResponse.json({ ok: true, ignored: 'unpaid' });
  }

  const data = event.data;
  if (!data) {
    return NextResponse.json({ ok: true, unmatched: true });
  }

  const userId = extractPolarUserId(data);
  const orderId = data.id ?? null;
  const email = data.customer?.email ?? null;

  const target = await resolveLicenseUser(data, email);
  if (!target) {
    console.warn('[license/webhook] unmatched event', event.type, { userId, email, orderId });
    return NextResponse.json({ ok: true, unmatched: true });
  }

  const [account] = await db.select().from(users).where(eq(users.id, target.id)).limit(1);
  if (!account) {
    return NextResponse.json({ ok: true, unmatched: true });
  }

  await ensureAccountLicensed(account, orderId);

  return NextResponse.json({ ok: true, granted: target.id });
}
