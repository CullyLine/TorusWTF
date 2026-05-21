import { NextResponse } from 'next/server';
import { runSearch } from '@/lib/search';

/** GET /api/search?q= — clips and users matching query. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const results = await runSearch(q);
  return NextResponse.json(results);
}
