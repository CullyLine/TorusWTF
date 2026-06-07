import Replicate from 'replicate';
import type { ComputeProvider, StemSeparationInput, StemSeparationResult } from './types.js';

/**
 * Replicate-backed compute provider. Uses the maintained Demucs v4 fork
 * (ryan5453/demucs). Validated end-to-end at ~60s/song, ~$0.02-0.03 cost.
 */

const MODEL_OWNER = 'ryan5453';
const MODEL_NAME = 'demucs';

let client: Replicate | null = null;
function getClient(): Replicate {
  const auth = process.env.REPLICATE_API_TOKEN;
  if (!auth) throw new Error('REPLICATE_API_TOKEN is not set.');
  return (client ??= new Replicate({ auth }));
}

async function toBuffer(value: unknown): Promise<Buffer | null> {
  if (!value) return null;
  // Newer replicate client returns FileOutput objects with a blob() method.
  if (typeof (value as { blob?: unknown }).blob === 'function') {
    const blob = await (value as { blob: () => Promise<Blob> }).blob();
    return Buffer.from(await blob.arrayBuffer());
  }
  const url =
    typeof value === 'string'
      ? value
      : typeof (value as { url?: unknown }).url === 'function'
        ? (value as { url: () => unknown }).url()?.toString()
        : (value as { url?: unknown }).url
          ? String((value as { url: unknown }).url)
          : null;
  if (!url || !url.startsWith('http')) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

export const replicateProvider: ComputeProvider = {
  name: 'replicate',

  async separateStems(input: StemSeparationInput): Promise<StemSeparationResult> {
    const replicate = getClient();
    const model = await replicate.models.get(MODEL_OWNER, MODEL_NAME);
    const versionId = model.latest_version?.id;
    if (!versionId) throw new Error('Could not resolve Demucs model version.');

    const output = (await replicate.run(`${MODEL_OWNER}/${MODEL_NAME}:${versionId}`, {
      input: {
        audio: input.audioUrl,
        stem: 'none', // return all stems
        output_format: 'mp3',
      },
    })) as Record<string, unknown>;

    const stems: Record<string, Buffer> = {};
    for (const [name, value] of Object.entries(output ?? {})) {
      const buf = await toBuffer(value);
      if (buf) stems[name] = buf;
    }
    if (Object.keys(stems).length === 0) {
      throw new Error('Stem separation returned no audio.');
    }
    return { stems };
  },
};
