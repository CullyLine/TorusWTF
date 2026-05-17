import { count, desc, gte, sum } from 'drizzle-orm';
import { Queue } from 'bullmq';
import { db, clips } from '@/lib/db';
import { storage } from '@/lib/storage';
import { getRedis } from '@/lib/redis';
import { requireAdmin, isEmergencyStopActive } from '@/lib/admin';
import { EmergencyStopToggle } from './EmergencyStopToggle';

export const dynamic = 'force-dynamic';

interface HealthMetrics {
  storageBytes: number;
  totalClips: number;
  todayUploads: number;
  todayBytes: number;
  queueDepth: number;
  failedRecent: number;
  redisOk: boolean;
  emergencyStop: boolean;
}

async function gatherMetrics(): Promise<HealthMetrics> {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;

  // Storage bytes — use the driver if it can report, else sum from DB
  let storageBytes = 0;
  try {
    storageBytes = (await storage.totalBytes?.()) ?? 0;
  } catch {
    // ignore
  }
  if (storageBytes === 0) {
    const r = await db.select({ total: sum(clips.originalBytes) }).from(clips);
    storageBytes = Number(r[0]?.total ?? 0);
  }

  const totalClipsRows = await db.select({ c: count() }).from(clips);
  const totalClips = Number(totalClipsRows[0]?.c ?? 0);

  const todayRows = await db
    .select({ c: count(), b: sum(clips.originalBytes) })
    .from(clips)
    .where(gte(clips.createdAt, dayAgo));
  const todayUploads = Number(todayRows[0]?.c ?? 0);
  const todayBytes = Number(todayRows[0]?.b ?? 0);

  // BullMQ status
  let queueDepth = 0;
  let failedRecent = 0;
  let redisOk = false;
  try {
    const redis = getRedis();
    await redis.ping();
    redisOk = true;
    const q = new Queue('process-clip', { connection: redis });
    queueDepth = await q.getWaitingCount();
    failedRecent = await q.getFailedCount();
  } catch {
    // redis down
  }

  return {
    storageBytes,
    totalClips,
    todayUploads,
    todayBytes,
    queueDepth,
    failedRecent,
    redisOk,
    emergencyStop: await isEmergencyStopActive(),
  };
}

export default async function HealthPage() {
  await requireAdmin();
  const m = await gatherMetrics();

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">instance health</h1>
      <p className="mt-2 text-sm text-torus-fg-dim">Glance check — is everything fine right now?</p>

      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="total clips" value={String(m.totalClips)} />
        <Stat label="storage used" value={formatBytes(m.storageBytes)} />
        <Stat label="redis" value={m.redisOk ? 'ok' : 'down'} ok={m.redisOk} />
        <Stat label="queue waiting" value={String(m.queueDepth)} />
        <Stat label="queue failed" value={String(m.failedRecent)} ok={m.failedRecent === 0} />
        <Stat label="uploads (24h)" value={`${m.todayUploads} · ${formatBytes(m.todayBytes)}`} />
      </section>

      <section className="mt-12 rounded-2xl border border-torus-border-strong bg-torus-surface p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-torus-fg-dim">
          emergency stop
        </h2>
        <p className="mt-2 text-sm text-torus-fg-dim">
          Toggles a global flag that blocks all new uploads immediately. Existing clips remain
          accessible.
        </p>
        <div className="mt-4">
          <EmergencyStopToggle initial={m.emergencyStop} />
        </div>
      </section>

      <section className="mt-8 text-xs text-torus-fg-faint">
        Observability is intentionally self-contained — structured JSON logs go to stdout. Wire them
        into any log aggregator. Optional Sentry/PostHog integration is{' '}
        <strong>off by default</strong>.
      </section>
    </main>
  );
}

function Stat({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="rounded-xl border border-torus-border bg-torus-surface p-4">
      <div className="text-xs uppercase tracking-wider text-torus-fg-faint">{label}</div>
      <div
        className={`mt-2 font-mono text-xl ${
          ok === false ? 'text-torus-bass' : ok === true ? 'text-torus-mid' : 'text-torus-fg'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log10(n) / 3));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}
