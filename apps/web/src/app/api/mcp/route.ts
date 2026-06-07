import { NextResponse } from 'next/server';
import { SERVICES } from '@torus/shared';
import { authenticateApiKey, enforceRateLimit, enforceDailySpendCap, ApiKeyError } from '@/lib/api-keys';
import {
  createAndStartJobFromBytes,
  waitForJob,
  serializeJob,
  JobValidationError,
  InsufficientCreditsError,
} from '@/lib/jobs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Minimal Model Context Protocol (MCP) endpoint over streamable HTTP (JSON-RPC).
 * Lets AI agents discover and call TorusFM services with an API key:
 *   Authorization: Bearer tk_live_...
 *
 * Supports: initialize, tools/list, tools/call. Tool calls are synchronous and
 * billed in credits per run.
 */

const PROTOCOL_VERSION = '2024-11-05';

interface RpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: RpcRequest['id'], result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, result });
}

function rpcError(id: RpcRequest['id'], code: number, message: string) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
}

const TOOLS = [
  {
    name: 'separate_stems',
    description: `${SERVICES.stems.description} Costs ${SERVICES.stems.creditCost} credits per run.`,
    inputSchema: {
      type: 'object',
      required: ['audioUrl'],
      properties: {
        audioUrl: {
          type: 'string',
          description: 'Public URL of the audio file to separate.',
        },
      },
    },
  },
];

export async function POST(req: Request) {
  let body: RpcRequest;
  try {
    body = (await req.json()) as RpcRequest;
  } catch {
    return rpcError(null, -32700, 'Parse error');
  }

  const { id, method, params } = body;

  switch (method) {
    case 'initialize':
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'torusfm', version: '1.0.0' },
      });

    case 'notifications/initialized':
    case 'notifications/cancelled':
      // Notifications carry no id and expect no body.
      return new NextResponse(null, { status: 202 });

    case 'ping':
      return rpcResult(id, {});

    case 'tools/list':
      return rpcResult(id, { tools: TOOLS });

    case 'tools/call':
      return handleToolCall(req, id, params);

    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

async function handleToolCall(
  req: Request,
  id: RpcRequest['id'],
  params: Record<string, unknown> | undefined,
) {
  const authed = await authenticateApiKey(req);
  if (!authed) {
    return rpcError(id, -32000, 'Unauthorized: provide Authorization: Bearer tk_live_...');
  }

  const name = params?.name as string | undefined;
  const args = (params?.arguments ?? {}) as Record<string, unknown>;

  if (name !== 'separate_stems') {
    return rpcError(id, -32602, `Unknown tool: ${name}`);
  }

  const audioUrl = args.audioUrl as string | undefined;
  if (!audioUrl) {
    return rpcError(id, -32602, 'Missing required argument: audioUrl');
  }

  try {
    await enforceRateLimit(authed.apiKey);
    enforceDailySpendCap(authed.apiKey, SERVICES.stems.creditCost);

    const res = await fetch(audioUrl);
    if (!res.ok) {
      return toolError(id, `Could not fetch audioUrl (${res.status}).`);
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength > SERVICES.stems.maxInputBytes) {
      return toolError(id, 'File too large.');
    }
    const contentType = res.headers.get('content-type') ?? 'audio/mpeg';
    const filename = new URL(audioUrl).pathname.split('/').pop() || 'audio';

    let job = await createAndStartJobFromBytes({
      userId: authed.user.id,
      service: 'stems',
      filename,
      contentType,
      bytes,
      source: 'api',
      apiKeyId: authed.apiKey.id,
    });
    job = (await waitForJob(authed.user.id, job.id)) ?? job;

    const serialized = await serializeJob(job);
    if (job.status !== 'succeeded') {
      return toolError(id, `Job ${job.status}: ${serialized.error ?? 'unknown error'}`);
    }

    const lines = (serialized.outputs ?? [])
      .map((o) => `- ${o.name}: ${o.downloadUrl}`)
      .join('\n');
    return rpcResult(id, {
      content: [
        {
          type: 'text',
          text: `Separated into ${serialized.outputs?.length ?? 0} stems (${job.creditCost} credits):\n${lines}\n\nLinks expire; download soon.`,
        },
      ],
      structuredContent: serialized,
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return toolError(id, 'Insufficient credits. Top up at /credits.');
    }
    if (err instanceof ApiKeyError) {
      return toolError(id, err.message);
    }
    if (err instanceof JobValidationError) {
      return toolError(id, err.message);
    }
    console.error('[mcp] tool call error:', err);
    return toolError(id, 'Internal error.');
  }
}

function toolError(id: RpcRequest['id'], text: string) {
  return rpcResult(id, { content: [{ type: 'text', text }], isError: true });
}
