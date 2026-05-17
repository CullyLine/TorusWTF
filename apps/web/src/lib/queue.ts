import 'server-only';
import { Queue } from 'bullmq';
import { getRedis } from './redis';

export const PROCESS_CLIP_QUEUE = 'process-clip';

export interface ProcessClipJobData {
  clipId: string;
}

let cached: Queue<ProcessClipJobData> | null = null;

export function getClipQueue(): Queue<ProcessClipJobData> {
  if (cached) return cached;
  cached = new Queue<ProcessClipJobData>(PROCESS_CLIP_QUEUE, {
    connection: getRedis(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { age: 24 * 60 * 60, count: 500 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    },
  });
  return cached;
}
