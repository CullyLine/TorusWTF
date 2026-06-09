import { createClient as createRemoteClient, type Client } from '@libsql/client/web';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { createRequire } from 'node:module';
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
 * Builds a libSQL client, picking the entrypoint by URL scheme:
 *   - remote (`libsql://`, `http(s)://`, `ws(s)://`) → `@libsql/client/web`, a
 *     pure-JS client that talks to Turso over HTTP/WS. No native bindings, so it
 *     runs cleanly on Vercel's serverless functions and the edge.
 *   - `file:` → the default `@libsql/client`, whose native bindings are only
 *     needed for an on-disk SQLite file (local dev). Loaded lazily so the native
 *     module is never required in production.
 */
function createLibsqlClient(url: string, authToken?: string): Client {
  if (url.startsWith('file:')) {
    const nodeRequire = createRequire(import.meta.url);
    const { createClient } = nodeRequire('@libsql/client') as typeof import('@libsql/client');
    return createClient({ url, authToken }) as unknown as Client;
  }
  return createRemoteClient({ url, authToken });
}

/**
 * Returns a singleton Drizzle client backed by libSQL.
 *
 * Local dev:  DATABASE_URL=file:./data/torus.db  (an on-disk SQLite file)
 * Production: DATABASE_URL=libsql://<db>.turso.io + TURSO_AUTH_TOKEN  (Turso)
 *
 * The Vercel Turso integration injects TURSO_DATABASE_URL / TURSO_AUTH_TOKEN, so
 * we accept those names too. Same driver both ways, so code and migrations are
 * identical across environments.
 */
export function getDb(databaseUrl?: string) {
  if (cachedDb) return cachedDb;

  const url = normalizeUrl(
    databaseUrl ??
      process.env.DATABASE_URL ??
      process.env.TURSO_DATABASE_URL ??
      'file:./data/torus.db',
  );
  const authToken = process.env.TURSO_AUTH_TOKEN ?? process.env.DATABASE_AUTH_TOKEN;

  const client = createLibsqlClient(url, authToken);
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
