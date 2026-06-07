import { eq } from 'drizzle-orm';
import { getDb, jobs, refundJob } from '@torus/db';
import { createStorage, StorageKeys } from '@torus/storage';
import { getProviderFor } from '../compute/index.js';

// Lazy singletons — created after the worker's env loader runs (see index.ts).
let _db: ReturnType<typeof getDb> | null = null;
let _storage: ReturnType<typeof createStorage> | null = null;
const db = () => (_db ??= getDb());
const storage = () => (_storage ??= createStorage());

export interface GpuJobResult {
  jobId: string;
  status: 'succeeded' | 'skipped';
  outputs?: number;
}

/**
 * Execute one compute job:
 *   1. mark running
 *   2. fetch the input via a presigned URL
 *   3. run the service on the configured provider
 *   4. upload outputs, mark succeeded (reservation stands)
 * On any failure the reserved credits are refunded and the job is marked failed.
 *
 * Credits were already reserved at job-start time. This runner only ever keeps
 * (success) or refunds (failure) — it never charges, so retries can't double-bill.
 */
export async function runGpuJob(jobId: string): Promise<GpuJobResult> {
  const job = await db().select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!job) throw new Error(`job ${jobId} not found`);

  // Only freshly-reserved, pending jobs run. Anything else (already running,
  // terminal, canceled) is a duplicate delivery — skip it.
  if (job.status !== 'pending') {
    return { jobId, status: 'skipped' };
  }
  if (!job.inputKey) throw new Error(`job ${jobId} has no input_key`);

  const provider = getProviderFor(job.service);
  await db()
    .update(jobs)
    .set({ status: 'running', provider: provider.name, startedAt: Date.now() })
    .where(eq(jobs.id, jobId));

  try {
    const inputUrl = await storage().downloadPresignedUrl(job.inputKey, 600);

    if (job.service === 'stems') {
      const result = await provider.separateStems({ audioUrl: inputUrl });
      const outputs: { name: string; key: string; bytes: number }[] = [];
      for (const [name, buf] of Object.entries(result.stems)) {
        const key = StorageKeys.labOutput(jobId, name, 'mp3');
        await storage().putObject(key, buf, 'audio/mpeg', 'private, max-age=3600');
        outputs.push({ name, key, bytes: buf.length });
      }

      await db()
        .update(jobs)
        .set({
          status: 'succeeded',
          settled: true,
          finishedAt: Date.now(),
          providerJobId: result.providerJobId ?? null,
          outputMeta: JSON.stringify({ stems: outputs, costUsd: result.costUsd ?? null }),
        })
        .where(eq(jobs.id, jobId));

      console.info(`[gpu] ✓ ${jobId} stems=${outputs.length}`);
      return { jobId, status: 'succeeded', outputs: outputs.length };
    }

    throw new Error(`Unknown service: ${job.service}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Refund first (idempotent), then mark failed. If refund somehow throws we
    // still record the failure so the job isn't stuck "running".
    try {
      refundJob(db(), { userId: job.userId, jobId, amount: job.creditCost });
    } catch (refundErr) {
      console.error(`[gpu] refund failed for ${jobId}:`, refundErr);
    }
    await db()
      .update(jobs)
      .set({ status: 'failed', settled: true, finishedAt: Date.now(), error: message })
      .where(eq(jobs.id, jobId));
    console.error(`[gpu] ✗ ${jobId} failed: ${message}`);
    throw err;
  }
}
