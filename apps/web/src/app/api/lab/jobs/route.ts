import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import {
  createJob,
  listJobsForUser,
  serializeJob,
  JobValidationError,
} from '@/lib/jobs';

const CreateBody = z.object({
  service: z.string().min(1).max(40),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive(),
});

/** POST /api/lab/jobs — create a job + get a presigned upload URL. */
export async function POST(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  try {
    const { job, uploadUrl } = await createJob({
      userId: user.id,
      service: parsed.data.service,
      filename: parsed.data.filename,
      contentType: parsed.data.contentType,
      sizeBytes: parsed.data.sizeBytes,
      source: 'web',
    });
    return NextResponse.json({
      jobId: job.id,
      uploadUrl,
      creditCost: job.creditCost,
    });
  } catch (err) {
    if (err instanceof JobValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[lab] create job failed:', err);
    return NextResponse.json({ error: 'Could not create job.' }, { status: 500 });
  }
}

/** GET /api/lab/jobs — list the current user's recent jobs. */
export async function GET(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  const jobs = await listJobsForUser(user.id, 25);
  const serialized = await Promise.all(jobs.map((j) => serializeJob(j)));
  return NextResponse.json({ jobs: serialized });
}
