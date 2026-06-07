import 'server-only';
import { Queue } from 'bullmq';
import { getRedis } from './redis';

export const GPU_JOBS_QUEUE = 'gpu-jobs';

export interface GpuJobData {
  jobId: string;
}

let cached: Queue<GpuJobData> | null = null;

export function getGpuQueue(): Queue<GpuJobData> {
  if (cached) return cached;
  cached = new Queue<GpuJobData>(GPU_JOBS_QUEUE, {
    connection: getRedis(),
    defaultJobOptions: {
      // No auto-retry: the runner refunds on failure, so a retry could double-bill.
      attempts: 1,
      removeOnComplete: { age: 24 * 60 * 60, count: 500 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    },
  });
  return cached;
}
