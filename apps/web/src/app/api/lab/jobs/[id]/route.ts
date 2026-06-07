import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getJobForUser, serializeJob } from '@/lib/jobs';

/** GET /api/lab/jobs/:id — job status + (when ready) presigned output URLs. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  const { id } = await ctx.params;
  const job = await getJobForUser(user.id, id);
  if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });

  return NextResponse.json({ job: await serializeJob(job) });
}
