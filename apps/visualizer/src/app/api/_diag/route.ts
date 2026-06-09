import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/** TEMPORARY diagnostic — reports env presence (no secret values) + a trivial query. Remove after use. */
export async function GET() {
  const url = process.env.DATABASE_URL ?? process.env.TURSO_DATABASE_URL ?? '';
  const scheme = url.split(':')[0] || '(none)';
  const info = {
    hasDATABASE_URL: Boolean(process.env.DATABASE_URL),
    hasTURSO_DATABASE_URL: Boolean(process.env.TURSO_DATABASE_URL),
    urlScheme: scheme,
    hasTURSO_AUTH_TOKEN: Boolean(process.env.TURSO_AUTH_TOKEN),
    tokenLength: (process.env.TURSO_AUTH_TOKEN ?? '').length,
    hasDATABASE_AUTH_TOKEN: Boolean(process.env.DATABASE_AUTH_TOKEN),
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
