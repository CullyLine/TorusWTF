import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema';

let cachedDb: BetterSQLite3Database<typeof schema> | null = null;
let cachedSqlite: Database.Database | null = null;

/**
 * Walks up the filesystem from `start` looking for the monorepo root
 * (the first ancestor that contains pnpm-workspace.yaml).
 * Falls back to `start` if not found — keeps tests working in any layout.
 */
function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

function resolveDbPath(url: string): string {
  // Strip the file: scheme if present
  const raw = url.startsWith('file:') ? url.slice(5) : url;

  // Absolute paths win — caller knows what they're doing
  if (isAbsolute(raw) || /^[a-zA-Z]:[\\/]/.test(raw)) return raw;

  // Relative paths are resolved against the monorepo root so every process
  // (web, worker, migrate CLI) reads/writes the same file regardless of cwd.
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = findRepoRoot(here);
  return resolve(repoRoot, raw);
}

/**
 * Returns a singleton Drizzle client connected to the SQLite file at DATABASE_URL.
 *
 * Pragmas enabled at connection:
 *   - journal_mode=WAL       — concurrent readers, single writer, way faster
 *   - synchronous=NORMAL     — safe with WAL, much faster than FULL
 *   - foreign_keys=ON        — enforce FK constraints
 *   - busy_timeout=5000      — wait up to 5s if a writer holds the lock
 */
export function getDb(databaseUrl?: string) {
  if (cachedDb) return cachedDb;

  const url = databaseUrl ?? process.env.DATABASE_URL ?? 'file:./data/torus.db';
  const dbPath = resolveDbPath(url);
  const absPath = resolve(dbPath);
  const dir = dirname(absPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(absPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('temp_store = MEMORY');
  sqlite.pragma('mmap_size = 268435456'); // 256 MB

  cachedSqlite = sqlite;
  cachedDb = drizzle(sqlite, { schema, casing: 'snake_case' });
  return cachedDb;
}

export function closeDb(): void {
  cachedSqlite?.close();
  cachedSqlite = null;
  cachedDb = null;
}

export type Db = ReturnType<typeof getDb>;
