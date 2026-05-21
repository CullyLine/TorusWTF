import 'server-only';
import { and, desc, eq, isNull, like, or, sql } from 'drizzle-orm';
import { db, clips, users } from '@/lib/db';

const LIMIT = 30;

export async function runSearch(raw: string) {
  const q = raw.trim().toLowerCase();
  if (!q) return { clips: [], users: [] };
  const pattern = `%${q}%`;

  const clipRows = await db
    .select({
      clipId: clips.id,
      shareCode: clips.shareCode,
      title: clips.title,
      ogImageKey: clips.ogImageKey,
      durationMs: clips.durationMs,
      ownerHandle: users.handle,
    })
    .from(clips)
    .leftJoin(users, eq(clips.ownerId, users.id))
    .where(
      and(
        isNull(clips.deletedAt),
        eq(clips.visibility, 'public'),
        eq(clips.status, 'ready'),
        or(
          like(sql`lower(${clips.title})`, pattern),
          like(sql`lower(${clips.creatorDisplayName})`, pattern),
        ),
      ),
    )
    .orderBy(desc(clips.createdAt))
    .limit(LIMIT);

  const userRows = await db
    .select({
      id: users.id,
      handle: users.handle,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      tier: users.tier,
    })
    .from(users)
    .where(and(eq(users.isBanned, false), like(sql`lower(${users.handle})`, pattern)))
    .orderBy(
      sql`CASE WHEN lower(${users.handle}) LIKE ${q + '%'} THEN 0 ELSE 1 END`,
      users.handle,
    )
    .limit(LIMIT);

  return {
    clips: clipRows,
    users: userRows,
  };
}
