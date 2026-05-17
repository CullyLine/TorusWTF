import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb, clips, votes, weeklyCharts } from '@torus/db';
import { previousWeekBucket } from '@torus/shared';

const db = getDb();

/**
 * Freezes the previous ISO-week's leaderboard into the weekly_charts table.
 * Designed to be run from a Monday 00:00 UTC cron schedule by the worker.
 *
 * Idempotent — if the previous week's snapshot already exists, returns early.
 */
export async function snapshotPreviousWeekCharts(maxRanks = 100): Promise<{
  weekBucket: string;
  inserted: number;
}> {
  const weekBucket = previousWeekBucket();

  const existing = await db
    .select({ rank: weeklyCharts.rank })
    .from(weeklyCharts)
    .where(eq(weeklyCharts.weekBucket, weekBucket))
    .limit(1);
  if (existing.length > 0) {
    return { weekBucket, inserted: 0 };
  }

  const leaderboard = await db
    .select({
      clipId: clips.id,
      voteCount: sql<number>`COUNT(${votes.userId})`,
    })
    .from(votes)
    .innerJoin(clips, eq(votes.clipId, clips.id))
    .where(
      and(
        eq(votes.weekBucket, weekBucket),
        isNull(clips.deletedAt),
        eq(clips.visibility, 'public'),
        eq(clips.status, 'ready'),
      ),
    )
    .groupBy(clips.id)
    .orderBy(desc(sql`COUNT(${votes.userId})`), desc(clips.createdAt))
    .limit(maxRanks);

  if (leaderboard.length === 0) {
    return { weekBucket, inserted: 0 };
  }

  const now = Date.now();
  const values = leaderboard.map((row, i) => ({
    weekBucket,
    rank: i + 1,
    clipId: row.clipId,
    voteCount: row.voteCount,
    snapshotAt: now,
  }));

  await db.insert(weeklyCharts).values(values);

  return { weekBucket, inserted: values.length };
}
