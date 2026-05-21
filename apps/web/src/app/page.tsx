import Link from 'next/link';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { isoWeekBucket } from '@torus/shared';
import { db, clips, users, votes } from '@/lib/db';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { SiteHeader } from '@/components/SiteHeader';
import { ClipRow, RecentTile, type ClipListEntry } from '@/components/ClipRow';
import { UploadButton } from '@/components/UploadButton';

export const dynamic = 'force-dynamic';

async function loadWeeklyLeaderboard(limit = 20): Promise<ClipListEntry[]> {
  const weekBucket = isoWeekBucket();
  const rows = await db
    .select({
      clipId: clips.id,
      shareCode: clips.shareCode,
      title: clips.title,
      ogImageKey: clips.ogImageKey,
      durationMs: clips.durationMs,
      voteCount: sql<number>`COUNT(${votes.userId})`,
      ownerHandle: users.handle,
    })
    .from(votes)
    .innerJoin(clips, eq(votes.clipId, clips.id))
    .leftJoin(users, eq(clips.ownerId, users.id))
    .where(
      and(
        eq(votes.weekBucket, weekBucket),
        isNull(clips.deletedAt),
        eq(clips.visibility, 'public'),
        eq(clips.status, 'ready'),
      ),
    )
    .groupBy(clips.id, users.handle)
    .orderBy(desc(sql`COUNT(${votes.userId})`), desc(clips.createdAt))
    .limit(limit);
  return rows;
}

async function loadRecentClips(limit = 12): Promise<ClipListEntry[]> {
  const rows = await db
    .select({
      clipId: clips.id,
      shareCode: clips.shareCode,
      title: clips.title,
      ogImageKey: clips.ogImageKey,
      durationMs: clips.durationMs,
      voteCount: sql<number>`0`,
      ownerHandle: users.handle,
    })
    .from(clips)
    .leftJoin(users, eq(clips.ownerId, users.id))
    .where(and(isNull(clips.deletedAt), eq(clips.visibility, 'public'), eq(clips.status, 'ready')))
    .orderBy(desc(clips.createdAt))
    .limit(limit);
  return rows;
}

export default async function HomePage() {
  const [leaderboard, recent, sessionUser] = await Promise.all([
    loadWeeklyLeaderboard(),
    loadRecentClips(),
    getCurrentUserFromCookies(),
  ]);
  const weekBucket = isoWeekBucket();

  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col px-6 py-12">
      <SiteHeader initialUser={sessionUser ? { handle: sessionUser.handle } : null} />

      <section className="mt-20 flex flex-col items-center text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">share the loop</h1>
        <p className="mt-6 max-w-md text-balance text-lg text-torus-fg-dim">
          Drop any audio. Get an instant link. No accounts required.
        </p>
        <div className="mt-10">
          <UploadButton label="Upload a clip" />
        </div>
      </section>

      <section className="mt-24">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="text-lg font-semibold">this week’s top clips</h2>
          <span className="font-mono text-xs text-torus-fg-faint">{weekBucket}</span>
        </div>
        {leaderboard.length === 0 ? (
          <p className="rounded-xl border border-torus-border bg-torus-surface p-6 text-sm text-torus-fg-dim">
            No votes yet this week. Upload something and share it.
          </p>
        ) : (
          <ol className="flex flex-col divide-y divide-torus-border">
            {leaderboard.map((entry, i) => (
              <ClipRow key={entry.clipId} rank={i + 1} entry={entry} showVotes />
            ))}
          </ol>
        )}
      </section>

      <section className="mt-16">
        <h2 className="mb-6 text-lg font-semibold">just dropped</h2>
        {recent.length === 0 ? (
          <p className="rounded-xl border border-torus-border bg-torus-surface p-6 text-sm text-torus-fg-dim">
            No clips yet. Be the first.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {recent.map((entry) => (
              <RecentTile key={entry.clipId} entry={entry} />
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-20 border-t border-torus-border pt-6 text-center text-xs text-torus-fg-faint">
        <Link href="/about" className="mx-2 hover:text-torus-fg">
          about
        </Link>
        ·
        <Link href="/support" className="mx-2 hover:text-torus-fg">
          support
        </Link>
        ·
        <Link href="/charts" className="mx-2 hover:text-torus-fg">
          charts
        </Link>
        ·
        <Link href="/privacy" className="mx-2 hover:text-torus-fg">
          privacy
        </Link>
        ·
        <Link href="/terms" className="mx-2 hover:text-torus-fg">
          terms
        </Link>
        ·
        <a
          href="https://github.com"
          className="mx-2 hover:text-torus-fg"
          target="_blank"
          rel="noreferrer"
        >
          github
        </a>
      </footer>
    </main>
  );
}
