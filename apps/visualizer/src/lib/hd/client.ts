/**
 * Thin wrapper around Home Depot's federation GraphQL gateway.
 *
 * Endpoint and headers mirror what the real homedepot.com website sends.
 * No auth needed for the operations we use — pricing, inventory, and
 * fulfillment are part of the anonymous consumer experience.
 */

/**
 * www.homedepot.com is hard-blocked from datacenter IPs (Akamai 403).
 * apionline.homedepot.com accepts the request and routes through the
 * federation gateway — that's the only viable host from Vercel.
 */
const HD_HOST = 'https://apionline.homedepot.com/federation-gateway/graphql';

/**
 * Build a v4 UUID for the guest customer token. THD's own JS generates
 * one per browsing session and re-uses it across requests — we mint a
 * fresh one per server call, which their subgraphs accept as a guest.
 */
function uuid(): string {
  // randomUUID exists on Node 22 globalThis.crypto.
  const g = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (g?.randomUUID) return g.randomUUID();
  // Fallback — extremely unlikely path on Vercel Node runtime.
  const hex = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += '-';
    else if (i === 14) s += '4';
    else if (i === 19) s += hex[(Math.random() * 4) | (0 + 8)];
    else s += hex[(Math.random() * 16) | 0];
  }
  return s;
}

function buildHeaders(
  operationName: string,
  ctx: { currentUrl: string; customerToken: string },
): Record<string, string> {
  // x-experience-name and apollographql-client-name are scoped per
  // operation. For searchModel both are literally "search" — using
  // anything else makes the federation gateway return its "Generic
  // Errors API" response (HTTP 206 with no products).
  const experience = operationName === 'searchModel' ? 'search' : 'general_merchandise';
  const clientName = operationName === 'searchModel' ? 'search' : 'thd-storefront';

  return {
    'Content-Type': 'application/json',
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    Origin: 'https://www.homedepot.com',
    Referer: `https://www.homedepot.com${ctx.currentUrl}`,
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'sec-ch-ua':
      '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'apollographql-client-name': clientName,
    'apollographql-client-version': '1.0.0',
    'x-experience-name': experience,
    'x-experience-id': operationName === 'searchModel' ? 'customer_search' : 'general_merchandise',
    'x-debug': 'false',
    'x-thd-channel': 'desktop',
    'x-thd-customer-token': ctx.customerToken,
    'x-current-url': ctx.currentUrl,
    'x-segment-customer-id': ctx.customerToken,
  };
}

export interface HdGraphqlError extends Error {
  status?: number;
  raw?: string;
  host?: string;
}

export interface HdGraphqlDebug {
  url: string;
  status: number;
  ok: boolean;
  bodySnippet: string;
}

/**
 * Calls Home Depot's federation gateway with browser-shaped headers.
 * Tries each candidate host in order until one returns a usable
 * `{ data, errors? }` JSON response. The last attempt's diagnostic
 * is attached via the optional out param so callers can surface it.
 */
interface HdGatewayResponse<T> {
  data?: T | { 'Generic Errors API': null } | null;
  // Standard GraphQL uses `errors` (plural). Home Depot's federation
  // gateway sometimes emits `error` (singular) when it can't route a
  // request — both shapes are handled below.
  errors?: Array<{ message: string }>;
  error?: Array<{ message: string }>;
}

function describeGatewayFailure<T>(json: HdGatewayResponse<T>): string | null {
  const errs = json.errors ?? json.error;
  if (errs?.length) {
    return errs
      .map((e) => e.message)
      .join('; ')
      .slice(0, 500);
  }
  if (
    json.data &&
    typeof json.data === 'object' &&
    'Generic Errors API' in (json.data as Record<string, unknown>)
  ) {
    return 'Generic Errors API (federation gateway refused to route)';
  }
  return null;
}

export async function hdGraphql<T>(
  operationName: string,
  query: string,
  variables: Record<string, unknown>,
  init?: {
    signal?: AbortSignal;
    debug?: HdGraphqlDebug[];
    /** Synthetic referer path (e.g. `/s/screws`). Defaults to `/`. */
    currentUrl?: string;
    /** Override the guest customer token (rare — usually leave undefined). */
    customerToken?: string;
  },
): Promise<T> {
  const url = `${HD_HOST}?opname=${operationName}`;
  const ctx = {
    currentUrl: init?.currentUrl ?? '/',
    customerToken: init?.customerToken ?? uuid(),
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(operationName, ctx),
      body: JSON.stringify({ operationName, query, variables }),
      cache: 'no-store',
      signal: init?.signal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    init?.debug?.push({ url, status: 0, ok: false, bodySnippet: message.slice(0, 300) });
    throw err instanceof Error ? err : new Error(message);
  }

  const rawText = await res.text().catch(() => '');
  init?.debug?.push({
    url,
    status: res.status,
    ok: res.ok,
    bodySnippet: rawText.slice(0, 500),
  });

  // 206 is "Partial Content" — HD's federation gateway emits it when
  // it routed to some subgraphs but not all. We still try to parse it
  // because the body may legitimately contain `data`.
  if (!res.ok && res.status !== 206) {
    const err = new Error(
      `Home Depot ${operationName} returned HTTP ${res.status}`,
    ) as HdGraphqlError;
    err.status = res.status;
    err.raw = rawText.slice(0, 500);
    throw err;
  }

  let json: HdGatewayResponse<T>;
  try {
    json = JSON.parse(rawText) as HdGatewayResponse<T>;
  } catch {
    const err = new Error(
      `Home Depot ${operationName} returned non-JSON (likely a bot challenge)`,
    ) as HdGraphqlError;
    err.status = res.status;
    err.raw = rawText.slice(0, 500);
    throw err;
  }

  const failure = describeGatewayFailure(json);
  if (failure) {
    const err = new Error(`Home Depot ${operationName}: ${failure}`) as HdGraphqlError;
    err.status = res.status;
    err.raw = rawText.slice(0, 500);
    throw err;
  }

  if (!json.data) {
    throw new Error(`Home Depot ${operationName} returned empty data`);
  }

  return json.data as T;
}
