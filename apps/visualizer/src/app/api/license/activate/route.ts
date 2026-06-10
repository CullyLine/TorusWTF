import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import {
  ensureAccountLicensed,
  extractPolarUserId,
  resolveLicenseUser,
} from '@/lib/license-grant';
import { hasLicense, licenseProductId } from '@/lib/license';
import { getPolarCheckout, listPolarOrdersForProduct } from '@/lib/polar';

const bodySchema = z.object({
  checkoutId: z.string().min(1).max(128).optional(),
});

/**
 * POST /api/license/activate — bind a paid Polar purchase to the signed-in
 * account. Used after checkout return (checkout id) and as a fallback when
 * the webhook was delayed or missed (reconcile by purchase email).
 */
export async function POST(req: Request) {
  const user = await getCurrentUser(req).catch(() => null);
  if (!user) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  if (hasLicense(user)) {
    return NextResponse.json({ granted: true, already: true });
  }

  const productId = licenseProductId();
  if (!productId || !process.env.POLAR_API_KEY) {
    return NextResponse.json({ error: 'License sync is not configured.' }, { status: 503 });
  }

  let checkoutId: string | undefined;
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    checkoutId = parsed.success ? parsed.data.checkoutId : undefined;
  } catch {
    checkoutId = undefined;
  }

  if (checkoutId) {
    const checkout = await getPolarCheckout(checkoutId);
    if ('error' in checkout) {
      return NextResponse.json({ error: checkout.error }, { status: 502 });
    }
    if (checkout.status !== 'succeeded') {
      return NextResponse.json({ granted: false, pending: true });
    }

    const target = await resolveLicenseUser(checkout, user.email);
    if (!target || target.id !== user.id) {
      return NextResponse.json(
        { error: 'This purchase belongs to a different account.' },
        { status: 403 },
      );
    }

    await ensureAccountLicensed(user, checkout.id);
    return NextResponse.json({ granted: true });
  }

  const orders = await listPolarOrdersForProduct(productId);
  if ('error' in orders) {
    return NextResponse.json({ error: orders.error }, { status: 502 });
  }

  const userEmail = user.email?.toLowerCase() ?? null;
  for (const order of orders) {
    if (!order.paid && order.status !== 'paid') continue;

    const orderUserId = extractPolarUserId(order);
    const orderEmail = order.customer?.email?.toLowerCase() ?? null;
    const matches =
      orderUserId === user.id || (userEmail && orderEmail && userEmail === orderEmail);

    if (!matches) continue;

    await ensureAccountLicensed(user, order.id);
    return NextResponse.json({ granted: true, reconciled: true });
  }

  return NextResponse.json({ granted: false });
}
