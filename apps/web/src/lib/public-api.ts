import 'server-only';
import { NextResponse } from 'next/server';
import { authenticateApiKey, enforceRateLimit, ApiKeyError, type AuthedKey } from '@/lib/api-keys';

/**
 * Shared helpers for the public, API-key-authenticated REST surface (/api/v1).
 */

export type AuthOutcome = { authed: AuthedKey } | { error: NextResponse };

/** Authenticate the Bearer key and apply the per-key rate limit. */
export async function authenticate(req: Request): Promise<AuthOutcome> {
  const authed = await authenticateApiKey(req);
  if (!authed) {
    return {
      error: NextResponse.json(
        { error: 'Invalid or missing API key. Pass `Authorization: Bearer tk_live_...`.' },
        { status: 401 },
      ),
    };
  }
  try {
    await enforceRateLimit(authed.apiKey);
  } catch (err) {
    if (err instanceof ApiKeyError) {
      return { error: NextResponse.json({ error: err.message }, { status: err.status }) };
    }
    throw err;
  }
  return { authed };
}

export function publicUrlBase(req: Request): string {
  return process.env.PUBLIC_URL ?? new URL(req.url).origin;
}
