import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Discovery manifest for AI agents/tools. Points to the OpenAPI spec and the
 * MCP endpoint so agents can find and use TorusFM services automatically.
 */
export function GET(req: Request) {
  const base = process.env.PUBLIC_URL ?? new URL(req.url).origin;
  return NextResponse.json({
    schema_version: 'v1',
    name_for_human: 'TorusFM',
    name_for_model: 'torusfm',
    description_for_human: 'Audio compute services (stem separation and more), billed in credits.',
    description_for_model:
      'Run audio compute tasks like stem separation. Authenticate with an API key ' +
      '(Authorization: Bearer tk_live_...). Billed per call in prepaid credits.',
    auth: { type: 'service_http', authorization_type: 'bearer' },
    api: { type: 'openapi', url: `${base}/api/v1/openapi.json` },
    mcp: { url: `${base}/api/mcp` },
    contact_email: 'hello@torus.wtf',
    legal_info_url: `${base}/about`,
  });
}
