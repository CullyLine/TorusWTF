import 'server-only';
import { randomBytes, createHash } from 'node:crypto';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db, apiKeys, jobs as jobsTable, users } from '@/lib/db';
import type { ApiKey, User } from '@torus/db';
import { generatePrefixedId } from '@torus/shared';
import { getRedis } from '@/lib/redis';

/**
 * Machine / AI-agent authentication via Bearer API keys. Only the SHA-256 hash
 * is stored; the plaintext key is shown exactly once at creation.
 *
 * Key format: tk_live_<40 hex chars>. The non-secret display prefix is the
 * first 12 chars ("tk_live_" + 4) so users can tell keys apart in the UI.
 */

const KEY_PREFIX = 'tk_live_';
const DEFAULT_RATE_PER_MIN = 60;

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export class ApiKeyError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiKeyError';
    this.status = status;
  }
}

export interface CreatedApiKey {
  id: string;
  name: string;
  prefix: string;
  /** Full plaintext key — returned ONCE, never stored. */
  key: string;
  createdAt: number;
}

export function createApiKey(opts: {
  userId: string;
  name: string;
  dailySpendCap?: number | null;
  rateLimitPerMin?: number | null;
}): CreatedApiKey {
  const secret = randomBytes(20).toString('hex'); // 40 hex chars
  const key = `${KEY_PREFIX}${secret}`;
  const prefix = key.slice(0, 12);
  const id = generatePrefixedId('key');

  const row = db
    .insert(apiKeys)
    .values({
      id,
      userId: opts.userId,
      name: opts.name.slice(0, 80),
      prefix,
      keyHash: hashKey(key),
      dailySpendCap: opts.dailySpendCap ?? null,
      rateLimitPerMin: opts.rateLimitPerMin ?? null,
    })
    .returning()
    .get();

  return { id: row.id, name: row.name, prefix: row.prefix, key, createdAt: row.createdAt };
}

export function listApiKeys(userId: string): Array<Omit<ApiKey, 'keyHash'>> {
  return db
    .select({
      id: apiKeys.id,
      userId: apiKeys.userId,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      dailySpendCap: apiKeys.dailySpendCap,
      rateLimitPerMin: apiKeys.rateLimitPerMin,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .all();
}

export function revokeApiKey(userId: string, keyId: string): boolean {
  const res = db
    .update(apiKeys)
    .set({ revokedAt: Date.now() })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
    .run();
  return res.changes > 0;
}

export interface AuthedKey {
  apiKey: ApiKey;
  user: User;
}

/** Resolve + validate a Bearer key from a request. Returns null if absent/invalid. */
export async function authenticateApiKey(req: Request): Promise<AuthedKey | null> {
  const header = req.headers.get('authorization') ?? '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  const key = m?.[1]?.trim();
  if (!key || !key.startsWith(KEY_PREFIX)) return null;

  const row = db.select().from(apiKeys).where(eq(apiKeys.keyHash, hashKey(key))).get();
  if (!row || row.revokedAt) return null;

  const user = db.select().from(users).where(eq(users.id, row.userId)).get();
  if (!user || user.isBanned) return null;

  // Best-effort last-used touch (don't block on it).
  db.update(apiKeys).set({ lastUsedAt: Date.now() }).where(eq(apiKeys.id, row.id)).run();

  return { apiKey: row, user };
}

/** Sliding per-minute rate limit via Redis. Throws ApiKeyError(429) when over. */
export async function enforceRateLimit(apiKey: ApiKey): Promise<void> {
  const limit = apiKey.rateLimitPerMin ?? DEFAULT_RATE_PER_MIN;
  const bucket = Math.floor(Date.now() / 60_000);
  const redisKey = `rl:key:${apiKey.id}:${bucket}`;
  try {
    const redis = getRedis();
    const count = await redis.incr(redisKey);
    if (count === 1) await redis.expire(redisKey, 120);
    if (count > limit) {
      throw new ApiKeyError('Rate limit exceeded. Slow down.', 429);
    }
  } catch (err) {
    if (err instanceof ApiKeyError) throw err;
    // Redis unavailable — fail open (don't block paid requests on a cache outage).
  }
}

/** Enforce the key's daily spend cap (in credits). Throws ApiKeyError(402). */
export function enforceDailySpendCap(apiKey: ApiKey, additionalCost: number): void {
  if (apiKey.dailySpendCap == null) return;
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const spent =
    db
      .select({ total: sql<number>`coalesce(sum(${jobsTable.creditCost}), 0)` })
      .from(jobsTable)
      .where(
        and(
          eq(jobsTable.apiKeyId, apiKey.id),
          gte(jobsTable.createdAt, startOfDay.getTime()),
          inArray(jobsTable.status, ['pending', 'running', 'succeeded']),
        ),
      )
      .get()?.total ?? 0;
  if (spent + additionalCost > apiKey.dailySpendCap) {
    throw new ApiKeyError(
      `Daily spend cap reached for this key (${apiKey.dailySpendCap} credits).`,
      402,
    );
  }
}
