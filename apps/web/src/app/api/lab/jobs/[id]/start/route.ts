import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { startJob, serializeJob, JobValidationError, InsufficientCreditsError } from '@/lib/jobs';

/** POST /api/lab/jobs/:id/start — reserve credits + enqueue after upload. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  const { id } = await ctx.params;
  try {
    const job = await startJob({ userId: user.id, jobId: id });
    return NextResponse.json({ job: await serializeJob(job) });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json({ error: err.message }, { status: 402 });
    }
    if (err instanceof JobValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[lab] start job failed:', err);
    return NextResponse.json({ error: 'Could not start job.' }, { status: 500 });
  }
}
