import Link from 'next/link';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { Logo } from '@torus/ui';
import { isoWeekBucket } from '@torus/shared';
import { db, clips, users, votes } from '@/lib/db';
import { storage } from '@/lib/storage';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { AuthNav } from '@/components/AuthNav';
import { UploadButton } from '@/components/UploadButton';

export const dynamic = 'force-dynamic';

interface LeaderboardEntry {
  clipId: string;
  shareCode: string;
  title: string | null;
  ogImageKey: string | null;
  durationMs: number | null;
  voteCount: number;
  ownerHandle: string | null;
}

async function loadWeeklyLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
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

async function loadRecentClips(limit = 12): Promise<LeaderboardEntry[]> {
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
      <header className="flex items-center justify-between">
        <Logo size={32} wordmark className="text-torus-fg" />
        <div className="flex items-center gap-2">
          <UploadButton variant="pill" label="upload (U)" />
          <AuthNav initialUser={sessionUser ? { handle: sessionUser.handle } : null} />
        </div>
      </header>

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
              <ChartRow key={entry.clipId} rank={i + 1} entry={entry} />
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

function ChartRow({ rank, entry }: { rank: number; entry: LeaderboardEntry }) {
  return (
    <li>
      <Link
        href={`/${entry.shareCode}`}
        className="flex items-center gap-4 rounded-lg p-3 hover:bg-torus-surface"
      >
        <span className="w-8 text-center font-mono text-sm text-torus-fg-faint">{rank}</span>
        <div
          className="h-12 w-20 flex-shrink-0 rounded bg-torus-surface"
          style={{
            backgroundImage: entry.ogImageKey
              ? `url(${storage.publicUrl(entry.ogImageKey)})`
              : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {entry.title ?? <span className="opacity-50">untitled</span>}
          </div>
          <div className="mt-1 font-mono text-xs text-torus-fg-faint">
            {entry.ownerHandle ? `@${entry.ownerHandle}` : 'anonymous'}
            {entry.durationMs ? ` · ${formatDuration(entry.durationMs)}` : ''}
          </div>
        </div>
        <span className="font-mono text-sm text-torus-fg-dim">
          {entry.voteCount} {entry.voteCount === 1 ? 'vote' : 'votes'}
        </span>
      </Link>
    </li>
  );
}

function RecentTile({ entry }: { entry: LeaderboardEntry }) {
  return (
    <li>
      <Link
        href={`/${entry.shareCode}`}
        className="block overflow-hidden rounded-lg border border-torus-border hover:border-torus-border-strong"
      >
        <div
          className="aspect-[2/1] w-full bg-torus-surface"
          style={{
            backgroundImage: entry.ogImageKey
              ? `url(${storage.publicUrl(entry.ogImageKey)})`
              : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
          aria-hidden
        />
        <div className="px-3 py-2">
          <div className="truncate text-xs font-medium">
            {entry.title ?? <span className="opacity-50">untitled</span>}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-torus-fg-faint">
            torus.fm/{entry.shareCode}
          </div>
        </div>
      </Link>
    </li>
  );
}

function formatDuration(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}`;
}
