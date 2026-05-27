import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Load .env from the monorepo root before any other module that reads env vars.
(function loadRootEnv() {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) {
      loadEnv({ path: resolve(dir, '.env'), override: false, quiet: true });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
})();

import { Worker, Queue } from 'bullmq';
import IORedis from 'ioredis';
import { processClip } from './jobs/process-clip.js';
import { snapshotPreviousWeekCharts } from './jobs/snapshot-weekly-charts.js';
import { startHealthWebhook } from './health-webhook.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? '2');

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// ---------- Clip-processing worker ----------
const worker = new Worker<{ clipId: string }>(
  'process-clip',
  async (job) => {
    console.info(`[worker] processing ${job.id} (clip ${job.data.clipId})`);
    return await processClip(job.data.clipId);
  },
  {
    connection,
    concurrency: CONCURRENCY,
    lockDuration: 5 * 60 * 1000,
    stalledInterval: 30 * 1000,
  },
);

// ---------- Cron worker: weekly chart snapshots ----------
const CRON_QUEUE = 'cron';
const cronQueue = new Queue(CRON_QUEUE, { connection });

// Monday 00:05 UTC — give the previous week a 5-min grace window before snapshotting.
await cronQueue.upsertJobScheduler(
  'snapshot-weekly-charts',
  { pattern: '5 0 * * 1', tz: 'UTC' },
  { name: 'snapshot-weekly-charts', data: {} },
);

new Worker(
  CRON_QUEUE,
  async (job) => {
    if (job.name === 'snapshot-weekly-charts') {
      const result = await snapshotPreviousWeekCharts();
      console.info('[cron] weekly chart snapshot:', result);
      return result;
    }
    return { skipped: job.name };
  },
  { connection, concurrency: 1 },
);

worker.on('completed', (job, result) => {
  console.info(`[worker] ✓ ${job.id} done`, result);
});

worker.on('failed', (job, err) => {
  console.error(`[worker] ✗ ${job?.id} failed:`, err.message);
});

worker.on('error', (err) => {
  console.error('[worker] error:', err);
});

startHealthWebhook();

console.info(`[worker] torus.wtf worker started, concurrency=${CONCURRENCY}`);

async function shutdown(signal: string) {
  console.info(`[worker] received ${signal}, draining...`);
  await worker.close();
  await connection.quit();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
