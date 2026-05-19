import { NextResponse } from 'next/server';
import { canManageClip, loadClipByShareCode } from '@/lib/clip-manage';

/**
 * GET /api/clips/:shareCode/manage
 * Authoritative check before showing edit/delete UI.
 */
export async function GET(req: Request, ctx: { params: Promise<{ shareCode: string }> }) {
  const { shareCode } = await ctx.params;
  const clip = await loadClipByShareCode(shareCode);
  if (!clip) {
    return NextResponse.json({ canManage: false }, { status: 404 });
  }

  const canManage = await canManageClip(req, clip);
  return NextResponse.json({ canManage });
}
