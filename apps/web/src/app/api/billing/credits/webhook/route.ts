import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { topUp } from '@/lib/credits';

/**
 * POST /api/billing/credits/webhook
 * Polar webhook receiver for one-time credit-pack purchases. Verifies the
 * Standard Webhooks signature, then grants credits idempotently by order id.
 *
 * Env: POLAR_WEBHOOK_SECRET (the value Polar shows when you create the endpoint).
 */

function verifyStandardWebhook(
  rawBody: string,
  headers: Headers,
  secret: string,
): boolean {
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signatureHeader = headers.get('webhook-signature');
  if (!id || !timestamp || !signatureHeader) return false;

  const secretBytes = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice(6), 'base64')
    : Buffer.from(secret, 'base64');

  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = createHmac('sha256', secretBytes).update(signedContent).digest('base64');

  // Header is a space-separated list of "v1,<sig>" entries.
  for (const part of signatureHeader.split(' ')) {
    const sig = part.includes(',') ? part.split(',')[1] : part;
    if (!sig) continue;
    try {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      // length mismatch etc.
    }
  }
  return false;
}

interface PolarEvent {
  type?: string;
  data?: {
    id?: string;
    status?: string;
    metadata?: Record<string, unknown>;
    customer?: { external_id?: string | null };
    checkout?: { metadata?: Record<string, unknown> };
  };
}

const PAID_TYPES = new Set(['order.paid', 'order.created']);

export async function POST(req: Request) {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 503 });
  }

  const rawBody = await req.text();
  if (!verifyStandardWebhook(rawBody, req.headers, secret)) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  let event: PolarEvent;
  try {
    event = JSON.parse(rawBody) as PolarEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const type = event.type ?? '';
  const data = event.data ?? {};
  const isPaid =
    PAID_TYPES.has(type) || (type === 'checkout.updated' && data.status === 'succeeded');
  if (!isPaid) {
    return NextResponse.json({ ok: true, ignored: type });
  }

  const meta = { ...(data.checkout?.metadata ?? {}), ...(data.metadata ?? {}) };
  const orderId = data.id;
  const userId =
    (typeof meta.user_id === 'string' && meta.user_id) || data.customer?.external_id || null;
  const credits = Number(meta.credits);

  if (!orderId || !userId || !Number.isFinite(credits) || credits <= 0) {
    console.warn('[credits] webhook missing fields', { type, orderId, userId, credits });
    return NextResponse.json({ ok: true, skipped: 'missing_fields' });
  }

  try {
    const entry = topUp({ userId, credits, orderId, metadata: { pack: meta.pack ?? null, type } });
    return NextResponse.json({ ok: true, ledgerId: entry.id, balanceAfter: entry.balanceAfter });
  } catch (err) {
    console.error('[credits] topUp failed:', err);
    return NextResponse.json({ error: 'Top-up failed.' }, { status: 500 });
  }
}
