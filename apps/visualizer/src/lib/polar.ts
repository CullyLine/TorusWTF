export interface LicenseValidationResult {
  valid: boolean;
  expiresAt?: string;
  reason?: string;
}

/**
 * Validates a Polar license key against the Polar API.
 * See https://docs.polar.sh for endpoint details.
 */
export async function validateLicenseKey(key: string): Promise<LicenseValidationResult> {
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
