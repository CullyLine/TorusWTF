import { defineConfig } from 'drizzle-kit';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

const url = process.env.DATABASE_URL ?? 'file:./data/torus.db';
const raw = url.startsWith('file:') ? url.slice(5) : url;

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

const absolutePath =
  isAbsolute(raw) || /^[a-zA-Z]:[\\/]/.test(raw) ? raw : resolve(findRepoRoot(process.cwd()), raw);

export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  casing: 'snake_case',
  dbCredentials: {
    url: absolutePath,
  },
  verbose: true,
  strict: true,
});
