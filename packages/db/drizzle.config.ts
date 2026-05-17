import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL ?? 'file:./data/torus.db';
const path = url.startsWith('file:') ? url.slice(5) : url;

export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  casing: 'snake_case',
  dbCredentials: {
    url: path,
  },
  verbose: true,
  strict: true,
});
