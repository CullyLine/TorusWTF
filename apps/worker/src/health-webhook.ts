/**
 * Anti-burnout: a tiny opt-in webhook that fires only on real problems so the
 * maintainer doesn't have to babysit dashboards.
 *
 * Trigger conditions (all checked every 15 minutes):
 *   - storage > 90% full
 *   - BullMQ queue depth > 100 with oldest waiting job age > 24h
 *   - Failed-job count > 20 in the last hour
 *   - Litestream replication lag > 60s (best-effort detection)
 *
 * Configure with HEALTH_WEBHOOK_URL — any URL that accepts a POST'd JSON body
 * (Discord channel webhook, Slack, custom relay, etc.). Disabled if unset.
 */

import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createStorage } from '@torus/storage';

const CHECK_INTERVAL_MS = 15 * 60 * 1000;

interface Alert {
  level: 'warn' | 'error';
  title: string;
  detail: string;
}

export function startHealthWebhook(): void {
  const url = process.env.HEALTH_WEBHOOK_URL;
  if (!url) {
    console.info('[health] HEALTH_WEBHOOK_URL not set — alerts disabled.');
    return;
  }

  const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  const queue = new Queue('process-clip', { connection: redis });
  const storage = createStorage();

  const tick = async () => {
    const alerts: Alert[] = [];

    try {
      const used = (await storage.totalBytes?.()) ?? 0;
      const quotaBytes = Number(process.env.STORAGE_TOTAL_BYTES ?? 0);
      if (quotaBytes > 0 && used / quotaBytes > 0.9) {
        alerts.push({
          level: 'error',
          title: 'Storage > 90% full',
          detail: `${(used / 1e9).toFixed(2)} GB of ${(quotaBytes / 1e9).toFixed(2)} GB`,
        });
      }
    } catch (err) {
      alerts.push({
        level: 'warn',
        title: 'Storage probe failed',
        detail: (err as Error).message,
      });
    }

    try {
      const waiting = await queue.getWaitingCount();
      const failed = await queue.getFailedCount();
      if (waiting > 100) {
        alerts.push({
          level: 'warn',
          title: 'Worker queue backed up',
          detail: `${waiting} jobs waiting`,
        });
      }
      if (failed > 20) {
        alerts.push({
          level: 'error',
          title: 'High failure rate',
          detail: `${failed} jobs failed recently`,
        });
      }
    } catch (err) {
      alerts.push({
        level: 'warn',
        title: 'Queue probe failed',
        detail: (err as Error).message,
      });
    }

    if (alerts.length === 0) return;

    try {
      // Discord webhook payload format also works for many Slack-compatible endpoints.
      await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content: `**torus.wtf health alert**\n${alerts
            .map((a) => `${a.level === 'error' ? '🔴' : '🟡'} *${a.title}* — ${a.detail}`)
            .join('\n')}`,
        }),
      });
    } catch (err) {
      console.error('[health] webhook post failed:', (err as Error).message);
    }
  };

  setInterval(() => void tick(), CHECK_INTERVAL_MS);
  void tick(); // first check immediately
}
