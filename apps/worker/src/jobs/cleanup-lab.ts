import { and, eq, lt, isNotNull } from 'drizzle-orm';
import { getDb, jobs } from '@torus/db';
import { createStorage } from '@torus/storage';

let _db: ReturnType<typeof getDb> | null = null;
let _storage: ReturnType<typeof createStorage> | null = null;
const db = () => (_db ??= getDb());
const storage = () => (_storage ??= createStorage());

/** Lab inputs/outputs are deleted this many hours after the job finishes. */
const RETENTION_HOURS = Number(process.env.LAB_RETENTION_HOURS ?? '24');

export interface CleanupResult {
  scanned: number;
  purged: number;
  objectsDeleted: number;
}

/**
 * Privacy + cost hygiene: delete uploaded inputs and generated outputs once a
 * Lab job is older than the retention window, then null out outputMeta so the
 * UI/API stop serving now-deleted links. Idempotent — safe to run repeatedly
 * (deleteObject ignores missing keys; purged rows are skipped via outputMeta IS
 * NULL + a marker on the input).
 */
export async function cleanupLabOutputs(): Promise<CleanupResult> {
  const cutoff = Date.now() - RETENTION_HOURS * 60 * 60 * 1000;

  // Terminal jobs past the window that still hold object metadata.
  const stale = await db()
    .select()
    .from(jobs)
    .where(and(lt(jobs.createdAt, cutoff), isNotNull(jobs.inputKey)))
    .all();

  let purged = 0;
  let objectsDeleted = 0;

  for (const job of stale) {
    // Skip jobs still in flight or not yet past their finish-based window.
    if (job.status === 'pending' || job.status === 'running') continue;
    if (job.finishedAt && job.finishedAt > cutoff) continue;

    const keys: string[] = [];
    if (job.inputKey) keys.push(job.inputKey);
    if (job.outputMeta) {
      try {
        const meta = JSON.parse(job.outputMeta) as { stems?: { key: string }[] };
        for (const s of meta.stems ?? []) if (s.key) keys.push(s.key);
      } catch {
        // ignore malformed meta
      }
    }
    if (keys.length === 0) continue;

    for (const key of keys) {
      try {
        await storage().deleteObject(key);
        objectsDeleted++;
      } catch (err) {
        console.error(`[cleanup] failed to delete ${key}:`, err);
      }
    }

    await db()
      .update(jobs)
      .set({ inputKey: null, outputMeta: null })
      .where(eq(jobs.id, job.id));
    purged++;
  }

  return { scanned: stale.length, purged, objectsDeleted };
}
