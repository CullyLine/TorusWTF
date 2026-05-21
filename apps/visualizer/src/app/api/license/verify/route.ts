import { NextResponse } from 'next/server';
import { z } from 'zod';
import { validateLicenseKey } from '@/lib/polar';

const bodySchema = z.object({
  key: z.string().min(8).max(128),
});

const bucket = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
const WINDOW_MS = 60_000;

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = bucket.get(ip);
  if (!entry || now > entry.resetAt) {
    bucket.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count += 1;
  return true;
}

export async function POST(req: Request) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  if (!rateLimit(ip)) {
    return NextResponse.json({ valid: false, reason: 'Too many attempts.' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ valid: false, reason: 'Invalid request.' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ valid: false, reason: 'Invalid license key format.' }, { status: 400 });
  }

  const result = await validateLicenseKey(parsed.data.key);
  return NextResponse.json({
    valid: result.valid,
    expiresAt: result.expiresAt,
    reason: result.reason,
  });
}
