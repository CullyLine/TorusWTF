import { NextResponse } from 'next/server';
import { authenticate } from '@/lib/public-api';
import { getJobForUser, serializeJob } from '@/lib/jobs';

export const dynamic = 'force-dynamic';

/** GET /api/v1/jobs/:id — status + (when ready) signed output URLs. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req);
  if ('error' in auth) return auth.error;

  const { id } = await ctx.params;
  const job = await getJobForUser(auth.authed.user.id, id);
  if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });

  return NextResponse.json({ job: await serializeJob(job) });
}
