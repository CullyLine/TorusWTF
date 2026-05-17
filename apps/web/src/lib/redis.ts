import 'server-only';
import IORedis from 'ioredis';

let cached: IORedis | null = null;

export function getRedis(): IORedis {
  if (cached) return cached;
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  cached = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
  });
  cached.on('error', (err) => {
    console.error('[redis] connection error:', err.message);
  });
  return cached;
}
