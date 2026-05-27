/**
 * Thin wrapper around Home Depot's federation GraphQL gateway.
 *
 * Endpoint and headers mirror what the real homedepot.com website sends.
 * No auth needed for the operations we use — pricing, inventory, and
 * fulfillment are part of the anonymous consumer experience.
 */

const HD_ENDPOINT = 'https://apionline.homedepot.com/federation-gateway/graphql';

const COMMON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  Origin: 'https://www.homedepot.com',
  Referer: 'https://www.homedepot.com/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'apollographql-client-name': 'thd-storefront-search',
  'apollographql-client-version': '1.0.0',
  'x-experience-name': 'general_merchandise',
  'x-debug': 'false',
};

export interface HdGraphqlError extends Error {
  status?: number;
  raw?: string;
}

export async function hdGraphql<T>(
  operationName: string,
  query: string,
  variables: Record<string, unknown>,
  init?: { signal?: AbortSignal },
): Promise<T> {
  const url = `${HD_ENDPOINT}?opname=${operationName}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: COMMON_HEADERS,
    body: JSON.stringify({ operationName, query, variables }),
    cache: 'no-store',
    signal: init?.signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(
      `Home Depot ${operationName} returned HTTP ${res.status}`,
    ) as HdGraphqlError;
    err.status = res.status;
    err.raw = body.slice(0, 500);
    throw err;
  }

  const json = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    const err = new Error(
      `Home Depot ${operationName} GraphQL errors: ${json.errors
        .map((e) => e.message)
        .join('; ')
        .slice(0, 500)}`,
    ) as HdGraphqlError;
    err.status = 200;
    throw err;
  }

  if (!json.data) {
    throw new Error(`Home Depot ${operationName} returned empty data`);
  }

  return json.data;
}
