import { createClient as createRemoteClient, type Client } from '@libsql/client/web';
import type { createClient as CreateNativeClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql/web';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
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
    // On-disk SQLite needs the native client. Build the specifier at runtime so
    // the bundler never sees it: this keeps the native module (and its `libsql`
    // binding) out of the serverless build, where only the remote web client is
    // ever used.
    const nodeRequire = createRequire(import.meta.url);
    const nativeId = ['@libsql', 'client'].join('/');
    const { createClient } = nodeRequire(nativeId) as { createClient: typeof CreateNativeClient };
    return createClient({ url, authToken }) as unknown as Client;
  }
  // Force plain HTTPS for remote Turso. The `libsql://` scheme makes the client
  // negotiate a WebSocket/hrana connection, which is unreliable on serverless
  // runtimes (it surfaced as auth 401s on Vercel); HTTP works everywhere.
  const httpUrl = url.replace(/^libsql:\/\//i, 'https://').replace(/^ws:\/\//i, 'http://').replace(/^wss:\/\//i, 'https://');
  return createRemoteClient({ url: httpUrl, authToken });
}

/**
 * Resolves the connection URL together with the token that belongs to it. The
 * URL and token MUST come from the same source: the Vercel Turso integration
 * injects `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` as a matched pair (often a
 * per-deployment branch DB), while a hand-set `DATABASE_URL` points at a fixed
 * database and pairs with `DATABASE_AUTH_TOKEN`. Mixing a URL from one source
 * with a token from the other yields an auth 401.
 *
 *   Local dev:  DATABASE_URL=file:./data/torus.db        (no token)
 *   Self-managed Turso:  DATABASE_URL + DATABASE_AUTH_TOKEN
 *   Vercel Turso integration:  TURSO_DATABASE_URL + TURSO_AUTH_TOKEN
 */
function resolveConnection(databaseUrl?: string): { url: string; authToken?: string } {
  if (databaseUrl) {
    return { url: databaseUrl, authToken: process.env.DATABASE_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN };
  }
  if (process.env.DATABASE_URL) {
    return {
      url: process.env.DATABASE_URL,
      authToken: process.env.DATABASE_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN,
    };
  }
  if (process.env.TURSO_DATABASE_URL) {
    return {
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN ?? process.env.DATABASE_AUTH_TOKEN,
    };
  }
  return { url: 'file:./data/torus.db' };
}

/**
 * Returns a singleton Drizzle client backed by libSQL. Same driver across
 * environments, so code and migrations are identical everywhere.
 */
export function getDb(databaseUrl?: string) {
  if (cachedDb) return cachedDb;

  const conn = resolveConnection(databaseUrl);
  const url = normalizeUrl(conn.url);

  const client = createLibsqlClient(url, conn.authToken);
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
