import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import * as schema from './schema';

let cachedDb: LibSQLDatabase<typeof schema> | null = null;
let cachedClient: Client | null = null;

/**
 * Walks up from `start` looking for the monorepo root (first ancestor that
 * contains pnpm-workspace.yaml). Falls back to `start` if not found.
 */
function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

/**
 * Normalizes the libSQL connection URL.
 *   - `libsql://`, `http(s)://`, `ws(s)://`  → passed through (Turso / remote)
 *   - `file:` (relative)  → anchored at the repo root so every process shares one file
 *   - `file:` (absolute)  → used as-is
 * For file URLs we also ensure the parent directory exists.
 */
function normalizeUrl(url: string): string {
  if (!url.startsWith('file:')) return url;
  const raw = url.slice('file:'.length);
  const abs =
    isAbsolute(raw) || /^[a-zA-Z]:[\\/]/.test(raw)
      ? raw
      : resolve(findRepoRoot(process.cwd()), raw);
  const dir = dirname(abs);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return `file:${abs}`;
}

/**
 * Returns a singleton Drizzle client backed by libSQL.
 *
 * Local dev:  DATABASE_URL=file:./data/torus.db  (an on-disk SQLite file)
 * Production: DATABASE_URL=libsql://<db>.turso.io + TURSO_AUTH_TOKEN  (Turso)
 *
 * Same driver both ways, so code and migrations are identical across environments.
 */
export function getDb(databaseUrl?: string) {
  if (cachedDb) return cachedDb;

  const url = normalizeUrl(databaseUrl ?? process.env.DATABASE_URL ?? 'file:./data/torus.db');
  const authToken = process.env.TURSO_AUTH_TOKEN ?? process.env.DATABASE_AUTH_TOKEN;

  const client = createClient({ url, authToken });
  cachedClient = client;
  cachedDb = drizzle(client, { schema, casing: 'snake_case' });
  return cachedDb;
}

export function closeDb(): void {
  cachedClient?.close();
  cachedClient = null;
  cachedDb = null;
}

export type Db = ReturnType<typeof getDb>;
