import { NextResponse } from 'next/server';
import { getService } from '@torus/shared';
import { authenticate, publicUrlBase } from '@/lib/public-api';
import { enforceDailySpendCap, ApiKeyError } from '@/lib/api-keys';
import {
  createAndStartJobFromBytes,
  waitForJob,
  serializeJob,
  JobValidationError,
  InsufficientCreditsError,
} from '@/lib/jobs';

export const dynamic = 'force-dynamic';
// Allow long-running synchronous (?wait) requests where the platform permits.
export const maxDuration = 300;

interface InputSpec {
  bytes: Buffer;
  filename: string;
  contentType: string;
  wait: boolean;
}

async function readInput(req: Request): Promise<InputSpec> {
  const ct = req.headers.get('content-type') ?? '';

  if (ct.includes('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      throw new JobValidationError('Provide an audio file in the `file` field.', 400);
    }
    return {
      bytes: Buffer.from(await file.arrayBuffer()),
      filename: file.name || 'audio',
      contentType: file.type || 'application/octet-stream',
      wait: String(form.get('wait') ?? '').toLowerCase() === 'true',
    };
  }

  if (ct.includes('application/json')) {
    const body = (await req.json().catch(() => null)) as {
      audioUrl?: string;
      wait?: boolean;
    } | null;
    if (!body?.audioUrl) {
      throw new JobValidationError('Provide `audioUrl` (or upload a file as multipart).', 400);
    }
    let res: Response;
    try {
      res = await fetch(body.audioUrl);
    } catch {
      throw new JobValidationError('Could not fetch audioUrl.', 400);
    }
    if (!res.ok) throw new JobValidationError(`Could not fetch audioUrl (${res.status}).`, 400);
    const contentType = res.headers.get('content-type') ?? 'audio/mpeg';
    const filename = new URL(body.audioUrl).pathname.split('/').pop() || 'audio';
    return {
      bytes: Buffer.from(await res.arrayBuffer()),
      filename,
      contentType,
      wait: body.wait === true,
    };
  }

  throw new JobValidationError('Send multipart/form-data or application/json.', 415);
}

/**
 * POST /api/v1/stems
 * Auth: Authorization: Bearer tk_live_...
 * Body: multipart file (`file`) OR JSON { audioUrl, wait }.
 * Returns: { job } (status_url for polling), or full result when wait=true.
 */
export async function POST(req: Request) {
  const auth = await authenticate(req);
  if ('error' in auth) return auth.error;
  const { user, apiKey } = auth.authed;

  const service = getService('stems')!;

  try {
    enforceDailySpendCap(apiKey, service.creditCost);

    const input = await readInput(req);
    if (input.bytes.byteLength > service.maxInputBytes) {
      return NextResponse.json({ error: 'File too large.' }, { status: 413 });
    }

    let job = await createAndStartJobFromBytes({
      userId: user.id,
      service: 'stems',
      filename: input.filename,
      contentType: input.contentType,
      bytes: input.bytes,
      source: 'api',
      apiKeyId: apiKey.id,
    });

    if (input.wait) {
      job = (await waitForJob(user.id, job.id)) ?? job;
    }

    const base = publicUrlBase(req);
    return NextResponse.json(
      {
        job: await serializeJob(job),
        statusUrl: `${base}/api/v1/jobs/${job.id}`,
      },
      { status: input.wait && job.status === 'succeeded' ? 200 : 202 },
    );
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json({ error: err.message }, { status: 402 });
    }
    if (err instanceof ApiKeyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof JobValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[api/v1/stems] error:', err);
    return NextResponse.json({ error: 'Internal error.' }, { status: 500 });
  }
}
