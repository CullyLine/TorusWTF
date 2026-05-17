import 'server-only';
import { eq, sql, and, gte } from 'drizzle-orm';
import { getEnv } from '@torus/shared';
import { db, clips } from './db.js';
import { getRedis } from './redis.js';
import { isEmergencyStopActive } from './admin.js';

export interface LimitCheckResult {
  ok: boolean;
  reason?: string;
  retryAfterSec?: number;
}

/**
 * Pre-flight check before issuing a presigned PUT URL. All limits enforced
 * server-side so attackers can't bypass by hitting storage directly.
 */
export async function checkUploadLimits(opts: {
  ip: string;
  userId: string | null;
  declaredBytes: number;
  declaredMime: string;
}): Promise<LimitCheckResult> {
  const env = getEnv();

  if (env.EMERGENCY_STOP || (await isEmergencyStopActive())) {
    return { ok: false, reason: 'Uploads are temporarily paused. Try again later.' };
  }

  if (opts.declaredBytes <= 0 || opts.declaredBytes > env.UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      reason: `File too large. Max ${(env.UPLOAD_MAX_BYTES / (1024 * 1024)).toFixed(0)} MB.`,
    };
  }

  const redis = getRedis();

  // Anonymous per-IP rate limits (sliding hour + day windows).
  if (!opts.userId) {
    const hourKey = `upload:ip:${opts.ip}:h`;
    const dayKey = `upload:ip:${opts.ip}:d`;

    const [hourCount, dayCount] = await Promise.all([redis.incr(hourKey), redis.incr(dayKey)]);
    if (hourCount === 1) await redis.expire(hourKey, 60 * 60);
    if (dayCount === 1) await redis.expire(dayKey, 24 * 60 * 60);

    if (hourCount > env.UPLOAD_ANON_PER_HOUR) {
      const ttl = await redis.ttl(hourKey);
      return { ok: false, reason: 'Hourly anonymous upload limit reached.', retryAfterSec: ttl };
    }
    if (dayCount > env.UPLOAD_ANON_PER_DAY) {
      const ttl = await redis.ttl(dayKey);
      return { ok: false, reason: 'Daily anonymous upload limit reached.', retryAfterSec: ttl };
    }
    return { ok: true };
  }

  // Per-user daily count cap.
  const userDayKey = `upload:u:${opts.userId}:d`;
  const userDayCount = await redis.incr(userDayKey);
  if (userDayCount === 1) await redis.expire(userDayKey, 24 * 60 * 60);

  if (userDayCount > env.UPLOAD_USER_PER_DAY) {
    const ttl = await redis.ttl(userDayKey);
    return { ok: false, reason: 'Daily upload limit reached.', retryAfterSec: ttl };
  }

  // Per-user lifetime storage quota — sum of all live clip original_bytes.
  const dayAgoMs = Date.now() - 24 * 60 * 60 * 1000;
  const cacheKey = `upload:u:${opts.userId}:quota`;
  let usedBytes = Number(await redis.get(cacheKey));
  if (!Number.isFinite(usedBytes) || usedBytes === 0) {
    const rows = await db
      .select({ total: sql<number>`COALESCE(SUM(${clips.originalBytes}), 0)` })
      .from(clips)
      .where(and(eq(clips.ownerId, opts.userId), gte(clips.createdAt, 0)));
    usedBytes = rows[0]?.total ?? 0;
    await redis.set(cacheKey, usedBytes, 'EX', 300);
  }

  if (usedBytes + opts.declaredBytes > env.UPLOAD_USER_QUOTA_BYTES) {
    return {
      ok: false,
      reason: `Storage quota exceeded. Used ${(usedBytes / (1024 * 1024 * 1024)).toFixed(2)} GB.`,
    };
  }

  return { ok: true };
}

/** Invalidate the cached per-user quota after a new upload completes. */
export async function bustQuotaCache(userId: string): Promise<void> {
  await getRedis().del(`upload:u:${userId}:quota`);
}
