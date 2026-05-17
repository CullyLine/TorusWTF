import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { getDb } from './client.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(here, '..', 'migrations');

const db = getDb();
console.info(`[db] Running migrations from ${migrationsFolder} ...`);
migrate(db, { migrationsFolder });
console.info('[db] Migrations applied.');
process.exit(0);
