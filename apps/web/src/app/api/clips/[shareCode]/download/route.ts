import { NextResponse } from 'next/server';
import { storage } from '@/lib/storage';
import { loadClipByShareCode } from '@/lib/clip-manage';

/**
 * GET /api/clips/:shareCode/download
 * Redirects to a short-lived presigned URL when downloads are enabled for the clip.
 * Streaming playback may still use the public Opus URL; this gate is for explicit downloads.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ shareCode: string }> }) {
  const { shareCode } = await ctx.params;
  const clip = await loadClipByShareCode(shareCode);
  if (!clip) {
    return NextResponse.json({ error: 'Clip not found.' }, { status: 404 });
  }
  if (!clip.allowDownload) {
    return NextResponse.json({ error: 'Downloads are disabled for this clip.' }, { status: 403 });
  }
  if (clip.status !== 'ready') {
    return NextResponse.json({ error: 'Clip is not ready yet.' }, { status: 409 });
  }

  const key = clip.originalKey ?? clip.opusKey;
  if (!key) {
    return NextResponse.json({ error: 'No audio available.' }, { status: 404 });
  }

  const url = await storage.downloadPresignedUrl(key, 5 * 60);
  const filename = clip.originalFilename?.replace(/[^\w.\- ()[\]]+/g, '_') || `${clip.shareCode}.audio`;

  return NextResponse.redirect(url, {
    headers: {
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
