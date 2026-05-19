import 'server-only';
import { eq } from 'drizzle-orm';
import { db, clips, type Clip } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { CLAIM_TOKEN_HEADER } from '@/lib/claim-tokens';
import { isValidShareCode, normalizeShareCode } from '@torus/shared';

export { CLAIM_TOKEN_HEADER };

export async function loadClipByShareCode(rawCode: string) {
  if (!isValidShareCode(rawCode)) return null;
  const code = normalizeShareCode(rawCode);
  const [clip] = await db.select().from(clips).where(eq(clips.shareCode, code)).limit(1);
  if (!clip || clip.deletedAt) return null;
  return clip;
}

function readClaimToken(req: Request): string | null {
  const header = req.headers.get(CLAIM_TOKEN_HEADER)?.trim();
  if (header) return header;
  return null;
}

/**
 * Signed-in owner for claimed clips; unclaimed anonymous clips only via claim
 * token while logged out (same browser that uploaded).
 */
export async function canManageClip(
  req: Request,
  clip: Clip,
  claimToken?: string | null,
): Promise<boolean> {
  const user = await getCurrentUser(req).catch(() => null);

  if (clip.ownerId) {
    return Boolean(user && user.id === clip.ownerId);
  }

  // Claimed-on-sign-in flow must attach the clip first — not via stale localStorage.
  if (user) return false;

  const token = claimToken?.trim() || readClaimToken(req);
  if (!token || !clip.claimToken) return false;
  return clip.claimToken === token;
}
