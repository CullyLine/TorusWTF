import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db, jobs as jobsTable } from '@/lib/db';
import type { Job } from '@torus/db';
import { generatePrefixedId, getService, type ServiceId } from '@torus/shared';
import { storage } from '@/lib/storage';
import { StorageKeys } from '@torus/storage';
import { getBalance, reserveCredits, refundJob, InsufficientCreditsError } from '@/lib/credits';
import { getGpuQueue } from '@/lib/gpu-queue';

export { InsufficientCreditsError };

const EXT_BY_MIME: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
};

function inferExt(filename: string, contentType: string): string {
  const fromName = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : '';
  if (fromName && /^[a-z0-9]{1,5}$/.test(fromName)) return fromName;
  return EXT_BY_MIME[contentType.toLowerCase()] ?? 'audio';
}

export class JobValidationError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'JobValidationError';
    this.status = status;
  }
}

export interface CreateJobInput {
  userId: string;
  service: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  source?: 'web' | 'api';
  apiKeyId?: string | null;
}

/**
 * Create a job row + return a presigned upload URL for the input. Credits are
 * NOT reserved here (only at start, after the upload succeeds) so an abandoned
 * upload never holds a charge. Fails fast if the balance can't cover the cost.
 */
export async function createJob(
  input: CreateJobInput,
): Promise<{ job: Job; uploadUrl: string }> {
  const service = getService(input.service);
  if (!service) throw new JobValidationError(`Unknown service: ${input.service}`, 404);

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new JobValidationError('Invalid file size.');
  }
  if (input.sizeBytes > service.maxInputBytes) {
    throw new JobValidationError(
      `File too large. Max ${(service.maxInputBytes / 1024 / 1024).toFixed(0)} MB.`,
      413,
    );
  }
  const mimeOk = service.acceptMime.some((p) => input.contentType.toLowerCase().startsWith(p));
  if (!mimeOk) throw new JobValidationError('Unsupported file type.', 415);

  const balance = getBalance(input.userId);
  if (balance < service.creditCost) {
    throw new JobValidationError(
      `Not enough credits. Need ${service.creditCost}, have ${balance}.`,
      402,
    );
  }

  const jobId = generatePrefixedId('job');
  const ext = inferExt(input.filename, input.contentType);
  const inputKey = StorageKeys.labInput(jobId, ext);

  const job = await db
    .insert(jobsTable)
    .values({
      id: jobId,
      userId: input.userId,
      service: service.id,
      status: 'pending',
      source: input.source ?? 'web',
      creditCost: service.creditCost,
      inputKey,
      apiKeyId: input.apiKeyId ?? null,
      inputMeta: JSON.stringify({
        filename: input.filename,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
      }),
    })
    .returning()
    .get();

  const uploadUrl = await storage.uploadPresignedUrl(inputKey, input.contentType, 900);
  return { job, uploadUrl };
}

/**
 * Reserve credits and enqueue the job for the worker. Verifies the input was
 * actually uploaded. Idempotent-ish: only acts on a pending, unreserved job.
 */
export async function startJob(opts: { userId: string; jobId: string }): Promise<Job> {
  const job = await getJobForUser(opts.userId, opts.jobId);
  if (!job) throw new JobValidationError('Job not found.', 404);
  if (job.status !== 'pending') {
    // Already started/finished — return as-is (idempotent for double clicks).
    return job;
  }
  if (!job.inputKey) throw new JobValidationError('Job has no input.', 400);

  const exists = await storage.objectExists(job.inputKey);
  if (!exists) throw new JobValidationError('Upload not found. Upload the file first.', 409);

  // Reserve credits (throws InsufficientCreditsError -> 402 at the route).
  const reservation = reserveCredits({
    userId: opts.userId,
    jobId: job.id,
    amount: job.creditCost,
    metadata: { service: job.service },
  });

  await db
    .update(jobsTable)
    .set({ reservationLedgerId: reservation.id })
    .where(eq(jobsTable.id, job.id));

  try {
    await getGpuQueue().add('gpu-job', { jobId: job.id }, { jobId: `gpu-${job.id}` });
  } catch (err) {
    // Couldn't enqueue — refund so we don't hold a charge for a job that won't run.
    refundJob({ userId: opts.userId, jobId: job.id, amount: job.creditCost });
    await db
      .update(jobsTable)
      .set({ status: 'failed', settled: true, error: 'Failed to enqueue job.' })
      .where(eq(jobsTable.id, job.id));
    throw err;
  }

  return (await getJobForUser(opts.userId, opts.jobId))!;
}

/**
 * One-shot helper for machine callers (public API / MCP): create a job, upload
 * the provided bytes to storage server-side, then start it. Returns the started
 * job. Credit reservation + validation happen inside create/start.
 */
export async function createAndStartJobFromBytes(opts: {
  userId: string;
  service: string;
  filename: string;
  contentType: string;
  bytes: Buffer | Uint8Array;
  source?: 'web' | 'api';
  apiKeyId?: string | null;
}): Promise<Job> {
  const { job, uploadUrl } = await createJob({
    userId: opts.userId,
    service: opts.service,
    filename: opts.filename,
    contentType: opts.contentType,
    sizeBytes: opts.bytes.byteLength,
    source: opts.source ?? 'api',
    apiKeyId: opts.apiKeyId ?? null,
  });

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': opts.contentType },
    body: new Blob([opts.bytes as unknown as BlobPart], { type: opts.contentType }),
  });
  if (!put.ok) {
    throw new JobValidationError('Failed to store input.', 502);
  }

  return startJob({ userId: opts.userId, jobId: job.id });
}

/** Block until a job reaches a terminal state, or timeout. For sync API/MCP. */
export async function waitForJob(
  userId: string,
  jobId: string,
  timeoutMs = 150_000,
): Promise<Job | undefined> {
  const deadline = Date.now() + timeoutMs;
  let job = await getJobForUser(userId, jobId);
  while (job && (job.status === 'pending' || job.status === 'running')) {
    if (Date.now() > deadline) break;
    await new Promise((r) => setTimeout(r, 2000));
    job = await getJobForUser(userId, jobId);
  }
  return job;
}

export async function getJobForUser(userId: string, jobId: string): Promise<Job | undefined> {
  return db
    .select()
    .from(jobsTable)
    .where(and(eq(jobsTable.id, jobId), eq(jobsTable.userId, userId)))
    .get();
}

export async function listJobsForUser(userId: string, limit = 25): Promise<Job[]> {
  return db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.userId, userId))
    .orderBy(desc(jobsTable.createdAt))
    .limit(limit)
    .all();
}

export interface SerializedJob {
  id: string;
  service: ServiceId | string;
  status: Job['status'];
  creditCost: number;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
  outputs: { name: string; downloadUrl: string; bytes: number }[];
}

/** Public job shape. Adds short-lived presigned download URLs for outputs. */
export async function serializeJob(job: Job): Promise<SerializedJob> {
  const outputs: SerializedJob['outputs'] = [];
  if (job.status === 'succeeded' && job.outputMeta) {
    try {
      const meta = JSON.parse(job.outputMeta) as {
        stems?: { name: string; key: string; bytes: number }[];
      };
      for (const o of meta.stems ?? []) {
        outputs.push({
          name: o.name,
          bytes: o.bytes,
          downloadUrl: await storage.downloadPresignedUrl(o.key, 3600),
        });
      }
    } catch {
      // ignore malformed outputMeta
    }
  }
  return {
    id: job.id,
    service: job.service,
    status: job.status,
    creditCost: job.creditCost,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error,
    outputs,
  };
}
