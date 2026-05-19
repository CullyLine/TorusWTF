import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, clips } from '@/lib/db';
import { canManageClip, loadClipByShareCode } from '@/lib/clip-manage';

const PatchBody = z.object({
  title: z.string().max(140).optional(),
  allowDownload: z.boolean().optional(),
  claimToken: z.string().min(1).optional(),
});

const DeleteBody = z.object({
  claimToken: z.string().min(1).optional(),
});

/**
 * PATCH /api/clips/:shareCode — update title and/or download setting.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ shareCode: string }> }) {
  const { shareCode } = await ctx.params;
  const clip = await loadClipByShareCode(shareCode);
  if (!clip) {
    return NextResponse.json({ error: 'Clip not found.' }, { status: 404 });
  }

  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!(await canManageClip(req, clip, parsed.data.claimToken))) {
    return NextResponse.json({ error: 'Not allowed to edit this clip.' }, { status: 403 });
  }

  const updates: { title?: string | null; allowDownload?: boolean } = {};
  if (typeof parsed.data.title !== 'undefined') {
    const trimmed = parsed.data.title.trim();
    updates.title = trimmed || null;
  }
  if (typeof parsed.data.allowDownload !== 'undefined') {
    updates.allowDownload = parsed.data.allowDownload;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update.' }, { status: 400 });
  }

  const [updated] = await db
    .update(clips)
    .set(updates)
    .where(eq(clips.id, clip.id))
    .returning({
      shareCode: clips.shareCode,
      title: clips.title,
      allowDownload: clips.allowDownload,
    });

  return NextResponse.json({ clip: updated });
}

/**
 * DELETE /api/clips/:shareCode — soft-delete (owner or claim token).
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ shareCode: string }> }) {
  const { shareCode } = await ctx.params;
  const clip = await loadClipByShareCode(shareCode);
  if (!clip) {
    return NextResponse.json({ error: 'Clip not found.' }, { status: 404 });
  }

  const parsed = DeleteBody.safeParse(await req.json().catch(() => ({})));
  const claimToken = parsed.success ? parsed.data.claimToken : undefined;

  if (!(await canManageClip(req, clip, claimToken))) {
    return NextResponse.json({ error: 'Not allowed to delete this clip.' }, { status: 403 });
  }

  await db
    .update(clips)
    .set({ deletedAt: Date.now(), deletedReason: 'owner' })
    .where(eq(clips.id, clip.id));

  return NextResponse.json({ ok: true });
}
