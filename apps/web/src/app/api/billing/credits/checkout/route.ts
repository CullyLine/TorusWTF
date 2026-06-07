import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getPack, packProductId } from '@/lib/credit-packs';

/**
 * GET /api/billing/credits/checkout?pack=starter
 * Creates a Polar checkout for a one-time credit pack and redirects to it.
 * Credits are granted by the webhook on payment (idempotent on the order id).
 *
 * Env: POLAR_API_KEY, POLAR_CREDITS_PRODUCT_<PACK>, optional POLAR_API_BASE.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.redirect(new URL('/signin', req.url));

  const url = new URL(req.url);
  const packId = url.searchParams.get('pack') ?? '';
  const pack = getPack(packId);
  if (!pack) return NextResponse.json({ error: 'Unknown pack.' }, { status: 400 });

  const apiKey = process.env.POLAR_API_KEY;
  const productId = packProductId(pack);
  if (!apiKey || !productId) {
    return NextResponse.redirect(new URL('/credits?error=not_configured', req.url));
  }

  const base = process.env.POLAR_API_BASE ?? 'https://api.polar.sh';
  const publicUrl = process.env.PUBLIC_URL ?? url.origin;

  try {
    const res = await fetch(`${base}/v1/checkouts/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        products: [productId],
        success_url: `${publicUrl}/credits?ok=1`,
        external_customer_id: user.id,
        metadata: {
          user_id: user.id,
          credits: pack.credits,
          pack: pack.id,
        },
      }),
    });
    if (!res.ok) {
      console.error('[credits] checkout create failed:', res.status, await res.text());
      return NextResponse.redirect(new URL('/credits?error=checkout_failed', req.url));
    }
    const data = (await res.json()) as { url?: string };
    if (!data.url) {
      return NextResponse.redirect(new URL('/credits?error=checkout_failed', req.url));
    }
    return NextResponse.redirect(data.url);
  } catch (err) {
    console.error('[credits] checkout error:', err);
    return NextResponse.redirect(new URL('/credits?error=checkout_failed', req.url));
  }
}
