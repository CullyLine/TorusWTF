import { NextResponse } from 'next/server';
import { hdGraphql, type HdGraphqlDebug } from '@/lib/hd/client';
import { extractAisleBay } from '@/lib/hd/enrich';
import { applyEnrichment, normalizeSearch } from '@/lib/hd/normalize';
import { PRODUCT_QUERY, SEARCH_MODEL_QUERY } from '@/lib/hd/queries';
import {
  HD_STORE_ID,
  HD_STORE_NAME,
  type HdItem,
  type HdSearchErr,
  type HdSearchOk,
} from '@/lib/hd/types';

/**
 * Internal-tool route powering /hd. Hits Home Depot's federation
 * GraphQL gateway with storefilter=IN_STORE so results are scoped to
 * what's actually on Hickory (#3628) shelves today. Aisle/bay missing
 * from searchModel are enriched per-item via productClientOnlyProduct.
 *
 * GET /api/hd/search?q=<keyword>&page=<n>
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 24;
const MAX_ENRICH_PARALLEL = 8;

async function enrichItems(items: HdItem[], signal: AbortSignal): Promise<HdItem[]> {
  const missing: number[] = [];
  items.forEach((it, idx) => {
    if (!it.aisle || !it.bay) missing.push(idx);
  });
  if (missing.length === 0) return items;

  const out = [...items];

  // Run enrichment in small batches to avoid hammering the gateway.
  for (let i = 0; i < missing.length; i += MAX_ENRICH_PARALLEL) {
    const batch = missing.slice(i, i + MAX_ENRICH_PARALLEL);
    await Promise.all(
      batch.map(async (idx) => {
        const it = out[idx];
        if (!it) return;
        try {
          const data = await hdGraphql<{ product?: unknown }>(
            'productClientOnlyProduct',
            PRODUCT_QUERY,
            { storeId: HD_STORE_ID, itemId: it.itemId },
            { signal },
          );
          const found = extractAisleBay(data.product);
          out[idx] = applyEnrichment(it, found);
        } catch {
          // Leave aisle/bay as-is; UI will show "No Home".
        }
      }),
    );
  }

  return out;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const pageParam = url.searchParams.get('page');
  const page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);
  const enrichParam = url.searchParams.get('enrich');
  const enrich = enrichParam === '0' || enrichParam === 'false' ? false : true;
  const debug =
    url.searchParams.get('debug') === '1' || url.searchParams.get('debug') === 'true';
  const storefilterParam = url.searchParams.get('storefilter');

  if (q.length < 2) {
    const empty: HdSearchOk = {
      ok: true,
      storeId: HD_STORE_ID,
      storeName: HD_STORE_NAME,
      query: q,
      total: 0,
      items: [],
    };
    return NextResponse.json(empty, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const upstreamDebug: HdGraphqlDebug[] = [];

  try {
    const data = await hdGraphql<Parameters<typeof normalizeSearch>[0]>(
      'searchModel',
      SEARCH_MODEL_QUERY,
      {
        storeId: HD_STORE_ID,
        startIndex: (page - 1) * PAGE_SIZE,
        pageSize: PAGE_SIZE,
        keyword: q,
        storefilter: storefilterParam ?? 'IN_STORE',
        channel: 'DESKTOP',
      },
      { signal: req.signal, debug: upstreamDebug },
    );

    const { items, total } = normalizeSearch(data);

    if (debug) {
      return NextResponse.json(
        {
          ok: true,
          query: q,
          storeId: HD_STORE_ID,
          storefilter: storefilterParam ?? 'IN_STORE',
          normalized: { total, itemCount: items.length, firstItem: items[0] ?? null },
          upstream: upstreamDebug,
          raw: data,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const enriched = enrich ? await enrichItems(items, req.signal) : items;

    const body: HdSearchOk = {
      ok: true,
      storeId: HD_STORE_ID,
      storeName: HD_STORE_NAME,
      query: q,
      total,
      items: enriched,
    };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Home Depot error';

    if (debug) {
      return NextResponse.json(
        {
          ok: false,
          query: q,
          storeId: HD_STORE_ID,
          storefilter: storefilterParam ?? 'IN_STORE',
          error: message,
          upstream: upstreamDebug,
        },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const body: HdSearchErr = {
      ok: false,
      storeId: HD_STORE_ID,
      storeName: HD_STORE_NAME,
      query: q,
      error: message,
    };
    return NextResponse.json(body, {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
