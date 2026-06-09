import { defineConfig } from 'drizzle-kit';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

const url =
  process.env.DATABASE_URL ?? process.env.TURSO_DATABASE_URL ?? 'file:./data/torus.db';
const authToken = process.env.TURSO_AUTH_TOKEN ?? process.env.DATABASE_AUTH_TOKEN;
const isFile = url.startsWith('file:');
const raw = isFile ? url.slice(5) : url;

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

// Only file: URLs get anchored to an absolute on-disk path. Remote libsql://
// (Turso) URLs are passed through verbatim with their auth token.
const absolutePath =
  isAbsolute(raw) || /^[a-zA-Z]:[\\/]/.test(raw) ? raw : resolve(findRepoRoot(process.cwd()), raw);

export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  casing: 'snake_case',
  dbCredentials: isFile ? { url: absolutePath } : { url, authToken },
  verbose: true,
  strict: true,
});
