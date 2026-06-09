export interface LicenseValidationResult {
  valid: boolean;
  expiresAt?: string;
  reason?: string;
}

const POLAR_API_BASE = process.env.POLAR_API_BASE ?? 'https://api.polar.sh';

/**
 * Create a one-time Polar checkout for the Production License. Returns the
 * hosted checkout URL the client should redirect to. `metadata.userId` is
 * echoed back on the order webhook so we can grant the license to the right
 * account.
 */
export async function createProductionLicenseCheckout(opts: {
  productId: string;
  userId: string;
  email: string | null;
  successUrl: string;
}): Promise<{ url: string } | { error: string }> {
  const apiKey = process.env.POLAR_API_KEY;
  if (!apiKey) return { error: 'Checkout is not configured.' };

  try {
    const res = await fetch(`${POLAR_API_BASE}/v1/checkouts/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        products: [opts.productId],
        success_url: opts.successUrl,
        ...(opts.email ? { customer_email: opts.email } : {}),
        metadata: { userId: opts.userId },
      }),
    });

    if (!res.ok) {
      return { error: `Polar checkout failed (${res.status}).` };
    }
    const data = (await res.json()) as { url?: string };
    if (!data.url) return { error: 'Polar did not return a checkout URL.' };
    return { url: data.url };
  } catch {
    return { error: 'Could not reach the checkout server.' };
  }
}

/**
 * Developer/test license key. Always treated as valid by the verify endpoint
 * regardless of whether Polar is configured, so we can exercise the pro
 * paths (4K/240fps, custom palette, saved presets, watermark removal,
 * pre-render unlocked output) without setting up real billing.
 *
 * If you want to disable this in production builds, gate the early-return
 * below on `process.env.NODE_ENV !== 'production'`.
 */
export const TEST_LICENSE_KEY = 'TORUS-WTF-TEST-UNLOCK';

/**
 * Validates a Polar license key against the Polar API.
 * See https://docs.polar.sh for endpoint details.
 */
export async function validateLicenseKey(key: string): Promise<LicenseValidationResult> {
  if (key === TEST_LICENSE_KEY && process.env.NODE_ENV !== 'production') {
    return { valid: true };
  }

  const apiKey = process.env.POLAR_API_KEY;
  const productId = process.env.POLAR_VISUALIZER_PRODUCT_ID;

  if (!apiKey) {
    return { valid: false, reason: 'License validation is not configured.' };
  }

  try {
    const res = await fetch('https://api.polar.sh/v1/license-keys/validate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key,
        ...(productId ? { organization_id: productId } : {}),
      }),
    });

    if (!res.ok) {
      return { valid: false, reason: 'Invalid license key.' };
    }

    const data = (await res.json()) as {
      status?: string;
      expires_at?: string | null;
    };

    const valid = data.status === 'granted' || data.status === 'active' || data.status === 'valid';
    return {
      valid,
      expiresAt: data.expires_at ?? undefined,
      reason: valid ? undefined : 'License key is not active.',
    };
  } catch {
    return { valid: false, reason: 'Could not reach license server.' };
  }
}
