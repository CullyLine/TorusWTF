import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

/**
 * GET /api/billing/polar/checkout?plan=monthly|annual
 *
 * Redirects to the Polar.sh hosted checkout for the selected plan.
 * Self-hosters set POLAR_PRODUCT_MONTHLY / POLAR_PRODUCT_ANNUAL to the product
 * IDs in their Polar dashboard.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.redirect(new URL('/signin', req.url));
  }

  const url = new URL(req.url);
  const plan = url.searchParams.get('plan') ?? 'monthly';
  const productId =
    plan === 'annual' ? process.env.POLAR_PRODUCT_ANNUAL : process.env.POLAR_PRODUCT_MONTHLY;
  const apiKey = process.env.POLAR_API_KEY;
  const publicUrl = process.env.PUBLIC_URL ?? new URL(req.url).origin;

  if (!apiKey || !productId) {
    return NextResponse.json(
      { error: 'Supporter tier is not configured on this instance.' },
      { status: 501 },
    );
  }

  try {
    const res = await fetch('https://api.polar.sh/v1/checkouts/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        products: [productId],
        success_url: `${publicUrl}/support?ok=1`,
        external_customer_id: user.id,
        metadata: { user_id: user.id },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Polar checkout error ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { url?: string };
    if (!data.url) throw new Error('Polar response missing checkout URL.');
    return NextResponse.redirect(data.url);
  } catch (err) {
    console.error('[polar] checkout failed:', (err as Error).message);
    return NextResponse.redirect(new URL('/support?error=checkout_failed', req.url));
  }
}
