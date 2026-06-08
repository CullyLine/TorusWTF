import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasLicense, licenseConfigured, licenseProductId } from '@/lib/license';
import { createProductionLicenseCheckout } from '@/lib/polar';

/**
 * POST /api/license/checkout — start a one-time Production License purchase.
 * Requires a signed-in account so the resulting order can be bound to it.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser(req).catch(() => null);
  if (!user) {
    return NextResponse.json({ error: 'Sign in to purchase a license.' }, { status: 401 });
  }
  if (hasLicense(user)) {
    return NextResponse.json({ error: 'You already have a Production License.' }, { status: 409 });
  }
  const productId = licenseProductId();
  if (!licenseConfigured() || !productId) {
    return NextResponse.json({ error: 'Checkout is not configured.' }, { status: 503 });
  }

  const origin =
    req.headers.get('origin') ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    new URL(req.url).origin;

  const result = await createProductionLicenseCheckout({
    productId,
    userId: user.id,
    email: user.email,
    successUrl: `${origin}/license?success=1`,
  });

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ url: result.url });
}
