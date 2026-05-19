import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { generateId, generateUniqueShareCode, type VisualizerPreset } from '@torus/shared';
import { db, clips } from '@/lib/db';
import { storage, StorageKeys } from '@/lib/storage';
import { clientIp, isAllowedAudioMime, extFromMime } from '@/lib/request';
import { checkUploadLimits } from '@/lib/upload-limits';
import { getCurrentUser } from '@/lib/auth';

const CreateClipBody = z.object({
  filename: z.string().min(1).max(256),
  contentType: z.string().min(1).max(120),
  bytes: z.number().int().positive(),
  title: z.string().max(140).optional(),
  description: z.string().max(2000).optional(),
  /** Anonymous attribution label (ignored when signed in). */
  creatorDisplayName: z.string().max(64).optional(),
  visualizerPreset: z
    .enum(['torus_field', 'particle_storm', 'spectral_tunnel', 'volumetric_waveform', 'none'])
    .optional(),
  visibility: z.enum(['public', 'unlisted']).default('public'),
});

/**
 * POST /api/clips
 * Issue a presigned upload URL + a fresh share code. The browser uploads
 * directly to storage; on completion it calls POST /api/clips/:id/complete.
 */
export async function POST(req: Request) {
  const body = CreateClipBody.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json(
      { error: 'Invalid request body.', details: body.error.flatten() },
      { status: 400 },
    );
  }

  if (!isAllowedAudioMime(body.data.contentType)) {
    return NextResponse.json(
      { error: `Unsupported content type: ${body.data.contentType}` },
      { status: 415 },
    );
  }

  const user = await getCurrentUser(req).catch(() => null);
  const ip = clientIp(req);

  const limitCheck = await checkUploadLimits({
    ip,
    userId: user?.id ?? null,
    declaredBytes: body.data.bytes,
    declaredMime: body.data.contentType,
  });
  if (!limitCheck.ok) {
    return NextResponse.json(
      { error: limitCheck.reason ?? 'Upload not allowed.' },
      {
        status: 429,
        headers: limitCheck.retryAfterSec
          ? { 'Retry-After': String(limitCheck.retryAfterSec) }
          : undefined,
      },
    );
  }

  const clipId = generateId();
  const shareCode = await generateUniqueShareCode(async (candidate) => {
    const existing = await db
      .select({ id: clips.id })
      .from(clips)
      .where(eq(clips.shareCode, candidate))
      .limit(1);
    return existing.length === 0;
  });

  const ext = extFromMime(body.data.contentType, 'bin');
  const originalKey = StorageKeys.original(clipId, ext);

  const uploadUrl = await storage.uploadPresignedUrl(
    originalKey,
    body.data.contentType,
    15 * 60, // 15 min to upload
  );

  // For anonymous uploads, generate a claim token so the uploader can later
  // attach this clip to a created account.
  const claimToken = user ? null : `clm_${generateId()}`;

  const creatorDisplayName = user
    ? null
    : normalizeCreatorDisplayName(body.data.creatorDisplayName);

  await db.insert(clips).values({
    id: clipId,
    shareCode,
    ownerId: user?.id ?? null,
    title: body.data.title?.trim() || null,
    description: body.data.description?.trim() || null,
    creatorDisplayName,
    originalFilename: body.data.filename,
    originalBytes: body.data.bytes,
    originalKey,
    visualizerPreset: (body.data.visualizerPreset ?? 'none') as VisualizerPreset,
    visibility: body.data.visibility,
    status: 'pending',
    claimToken,
  });

  return NextResponse.json(
    {
      clipId,
      shareCode,
      shareUrl: `${process.env.PUBLIC_URL ?? 'http://localhost:3000'}/${shareCode}`,
      uploadUrl,
      uploadKey: originalKey,
      claimToken,
      expiresInSec: 15 * 60,
    },
    { status: 201 },
  );
}

function normalizeCreatorDisplayName(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed.toLowerCase() === 'anonymous') return null;
  return trimmed.slice(0, 64);
}
