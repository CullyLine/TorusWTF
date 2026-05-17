import 'server-only';
import { getRedis } from './redis';

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec?: number;
}

/**
 * Sliding-window counter against Redis. Always increments on hit; if the
 * window's count exceeds `limit`, returns `ok: false` with the seconds to wait.
 * Counter expires at the end of the window.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const redis = getRedis();
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSec);
  if (count > limit) {
    const ttl = await redis.ttl(key);
    return { ok: false, remaining: 0, retryAfterSec: ttl > 0 ? ttl : windowSec };
  }
  return { ok: true, remaining: Math.max(0, limit - count) };
}

/**
 * "New account" throttle — anyone created in the last 24h gets tighter limits
 * on community actions to prevent automated spam without forcing captchas.
 */
export function isFreshAccount(userCreatedAtMs: number): boolean {
  return Date.now() - userCreatedAtMs < 24 * 60 * 60 * 1000;
}
