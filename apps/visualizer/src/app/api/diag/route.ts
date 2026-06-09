import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

function host(u: string): string {
  try {
    return new URL(u.replace(/^libsql:\/\//i, 'https://')).host;
  } catch {
    return '(unparseable)';
  }
}

function shortHash(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

/** TEMPORARY diagnostic — reports env presence + hashes (no secret values) + a trivial query. Remove after use. */
export async function GET() {
  const url = process.env.DATABASE_URL ?? process.env.TURSO_DATABASE_URL ?? '';
  const token = process.env.TURSO_AUTH_TOKEN ?? '';
  const info = {
    dbUrlHost: host(url),
    tursoUrlHost: host(process.env.TURSO_DATABASE_URL ?? ''),
    urlScheme: url.split(':')[0] || '(none)',
    tokenLength: token.length,
    tokenHash16: token ? shortHash(token) : '(none)',
    tokenTrimmedDiffers: token !== token.trim(),
    query: 'pending' as string,
  };
  try {
    await db.run(sql`SELECT 1`);
    info.query = 'ok';
  } catch (err) {
    info.query = 'error: ' + (err as Error).message;
  }
  return NextResponse.json(info);
}
