/**
 * Thin wrapper around Home Depot's federation GraphQL gateway.
 *
 * Endpoint and headers mirror what the real homedepot.com website sends.
 * No auth needed for the operations we use — pricing, inventory, and
 * fulfillment are part of the anonymous consumer experience.
 */

/**
 * Two upstream candidates — Home Depot exposes the same federation
 * gateway behind both hosts. apionline.* is what their own consumer
 * scripts talk to; www.* is the same gateway proxied through the main
 * site. If one host rate-limits / Akamai-challenges us, we fall back
 * to the other.
 */
const HD_HOSTS = [
  'https://www.homedepot.com/federation-gateway/graphql',
  'https://apionline.homedepot.com/federation-gateway/graphql',
] as const;

function buildHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    Origin: 'https://www.homedepot.com',
    Referer: 'https://www.homedepot.com/',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'sec-ch-ua':
      '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'apollographql-client-name': 'thd-storefront-search',
    'apollographql-client-version': '1.0.0',
    'x-experience-name': 'general_merchandise',
    'x-debug': 'false',
    'x-thd-customer-token': '',
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
export async function hdGraphql<T>(
  operationName: string,
  query: string,
  variables: Record<string, unknown>,
  init?: { signal?: AbortSignal; debug?: HdGraphqlDebug[] },
): Promise<T> {
  let lastError: Error | null = null;

  for (const host of HD_HOSTS) {
    const url = `${host}?opname=${operationName}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ operationName, query, variables }),
        cache: 'no-store',
        signal: init?.signal,
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      init?.debug?.push({ url, status: 0, ok: false, bodySnippet: lastError.message.slice(0, 300) });
      continue;
    }

    const rawText = await res.text().catch(() => '');
    init?.debug?.push({
      url,
      status: res.status,
      ok: res.ok,
      bodySnippet: rawText.slice(0, 500),
    });

    if (!res.ok) {
      const err = new Error(
        `Home Depot ${operationName} via ${host} returned HTTP ${res.status}`,
      ) as HdGraphqlError;
      err.status = res.status;
      err.raw = rawText.slice(0, 500);
      err.host = host;
      lastError = err;
      continue;
    }

    let json: { data?: T; errors?: Array<{ message: string }> };
    try {
      json = JSON.parse(rawText) as typeof json;
    } catch {
      // Akamai sometimes returns an HTML challenge page even on 200.
      const err = new Error(
        `Home Depot ${operationName} via ${host} returned non-JSON (likely a bot challenge)`,
      ) as HdGraphqlError;
      err.status = res.status;
      err.raw = rawText.slice(0, 500);
      err.host = host;
      lastError = err;
      continue;
    }

    if (json.errors?.length) {
      const err = new Error(
        `Home Depot ${operationName} GraphQL errors: ${json.errors
          .map((e) => e.message)
          .join('; ')
          .slice(0, 500)}`,
      ) as HdGraphqlError;
      err.status = 200;
      err.host = host;
      lastError = err;
      continue;
    }

    if (!json.data) {
      lastError = new Error(`Home Depot ${operationName} via ${host} returned empty data`);
      continue;
    }

    return json.data;
  }

  throw lastError ?? new Error(`Home Depot ${operationName} failed: unknown`);
}
