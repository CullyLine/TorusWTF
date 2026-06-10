import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { FEEDBACK_EMAIL } from '@/lib/constants';
import { sendFeedbackEmail } from '@/lib/mail';

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  category: z.enum(['bug', 'feature', 'other']),
  pageUrl: z.string().url().max(2000).optional(),
});

const bucket = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 8;
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

/** POST /api/feedback — deliver in-app feedback to feedback@torus.wtf via SMTP. */
export async function POST(req: Request) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  if (!rateLimit(ip)) {
    return NextResponse.json({ error: 'Too many messages. Try again in a minute.' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please add a title or details.' }, { status: 400 });
  }

  const user = await getCurrentUser(req).catch(() => null);

  try {
    await sendFeedbackEmail({
      to: process.env.FEEDBACK_TO_EMAIL ?? FEEDBACK_EMAIL,
      category: parsed.data.category,
      title: parsed.data.title,
      body: parsed.data.body,
      pageUrl: parsed.data.pageUrl,
      userEmail: user?.email ?? null,
    });
  } catch (err) {
    console.error('[feedback] send failed:', err);
    return NextResponse.json(
      { error: 'Could not send feedback right now. Email support@torus.wtf instead.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
