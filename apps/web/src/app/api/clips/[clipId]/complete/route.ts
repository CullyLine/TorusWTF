import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, clips } from '@/lib/db';
import { storage } from '@/lib/storage';
import { getClipQueue } from '@/lib/queue';
import { bustQuotaCache } from '@/lib/upload-limits';

/**
 * POST /api/clips/:clipId/complete
 * Called by the browser after the presigned PUT upload finishes.
 * Verifies the object exists, flips the clip to "processing", and enqueues
 * the worker job that does ffmpeg transcoding + waveform peak analysis.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ clipId: string }> }) {
  const { clipId } = await ctx.params;

  const [clip] = await db.select().from(clips).where(eq(clips.id, clipId)).limit(1);
  if (!clip) return NextResponse.json({ error: 'Clip not found.' }, { status: 404 });
  if (clip.deletedAt) return NextResponse.json({ error: 'Clip removed.' }, { status: 410 });

  if (clip.status !== 'pending') {
    return NextResponse.json(
      {
        clipId: clip.id,
        shareCode: clip.shareCode,
        status: clip.status,
        message: 'Already processing or processed.',
      },
      { status: 200 },
    );
  }

  if (!clip.originalKey) {
    return NextResponse.json({ error: 'Clip has no associated upload key.' }, { status: 400 });
  }

  // Confirm the upload actually arrived in storage before kicking off the worker.
  const exists = await storage.objectExists(clip.originalKey);
  if (!exists) {
    return NextResponse.json(
      { error: 'Upload not found in storage. Did the upload finish?' },
      { status: 409 },
    );
  }

  await db
    .update(clips)
    .set({ status: 'processing', statusError: null })
    .where(eq(clips.id, clip.id));

  await getClipQueue().add('process-clip', { clipId: clip.id }, { jobId: `clip:${clip.id}` });

  if (clip.ownerId) {
    await bustQuotaCache(clip.ownerId);
  }

  return NextResponse.json({
    clipId: clip.id,
    shareCode: clip.shareCode,
    status: 'processing',
  });
}
