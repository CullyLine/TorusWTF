import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, clips, users, follows, handleHistory } from '@/lib/db';
import { storage } from '@/lib/storage';
import { SiteHeader } from '@/components/SiteHeader';
import { ProfileFollowButton } from './ProfileFollowButton';
import { getCurrentUserFromCookies } from '@/lib/auth';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ handle: string }>;
}

async function loadProfile(rawHandle: string) {
  const handle = rawHandle.toLowerCase();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(sql`lower(${users.handle})`, handle))
    .limit(1);
  if (!user || user.isBanned) {
    const [hist] = await db
      .select({ userId: handleHistory.userId })
      .from(handleHistory)
      .where(eq(sql`lower(${handleHistory.oldHandle})`, handle))
      .limit(1);
    if (!hist?.userId) return null;
    const [current] = await db.select().from(users).where(eq(users.id, hist.userId)).limit(1);
    if (!current || current.isBanned) return null;
    redirect(`/u/${current.handle}`);
  }

  const userClips = await db
    .select({
      id: clips.id,
      shareCode: clips.shareCode,
      title: clips.title,
      durationMs: clips.durationMs,
      ogImageKey: clips.ogImageKey,
      createdAt: clips.createdAt,
      playCount: clips.playCount,
    })
    .from(clips)
    .where(and(eq(clips.ownerId, user.id), isNull(clips.deletedAt), eq(clips.visibility, 'public')))
    .orderBy(desc(clips.createdAt))
    .limit(60);

  const followerRows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(follows)
    .where(eq(follows.followeeId, user.id));
  const followerCount = followerRows[0]?.count ?? 0;

  return { user, clips: userClips, followerCount };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  const profile = await loadProfile(handle);
  if (!profile) return { title: 'not found' };
  return {
    title: `@${profile.user.handle}`,
    description: profile.user.bio ?? `${profile.user.handle} on torus.wtf`,
  };
}

export default async function ProfilePage({ params }: PageProps) {
  const { handle } = await params;
  const profile = await loadProfile(handle);
  if (!profile) notFound();

  const viewer = await getCurrentUserFromCookies();
  let alreadyFollowing = false;
  if (viewer && viewer.id !== profile.user.id) {
    const [row] = await db
      .select({ followerId: follows.followerId })
      .from(follows)
      .where(and(eq(follows.followerId, viewer.id), eq(follows.followeeId, profile.user.id)))
      .limit(1);
    alreadyFollowing = Boolean(row);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6 py-12">
      <SiteHeader
        logoSize={28}
        initialUser={viewer ? { handle: viewer.handle } : null}
      />

      <section className="mt-12 flex items-start gap-6">
        <div
          className="h-20 w-20 flex-shrink-0 rounded-full border border-torus-border-strong bg-torus-surface"
          style={{
            backgroundImage: profile.user.avatarUrl ? `url(${profile.user.avatarUrl})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            @{profile.user.handle}
            {profile.user.tier === 'supporter' ? (
              <span className="ml-2 align-middle text-torus-mid" title="Supporter">
                ★
              </span>
            ) : null}
          </h1>
          {profile.user.bio ? (
            <p className="mt-2 max-w-prose text-sm text-torus-fg-dim">{profile.user.bio}</p>
          ) : null}
          <div className="mt-3 flex items-center gap-4 text-xs text-torus-fg-faint">
            <span>{profile.clips.length} clips</span>
            <span>{profile.followerCount} followers</span>
          </div>
        </div>
        {viewer && viewer.id === profile.user.id ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href="/settings"
              className="rounded-full border border-torus-border-strong px-4 py-2 text-center text-xs font-medium text-torus-fg-dim transition hover:bg-torus-surface"
            >
              settings
            </Link>
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="w-full rounded-full border border-torus-border-strong px-4 py-2 text-xs font-medium text-torus-fg-dim transition hover:bg-torus-surface"
              >
                log out
              </button>
            </form>
          </div>
        ) : viewer ? (
          <ProfileFollowButton handle={profile.user.handle} initialFollowing={alreadyFollowing} />
        ) : null}
      </section>

      <section className="mt-10">
        {profile.clips.length === 0 ? (
          <p className="text-sm text-torus-fg-dim">No clips yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-torus-border">
            {profile.clips.map((clip) => (
              <li key={clip.id} className="py-4">
                <Link
                  href={`/${clip.shareCode}`}
                  className="flex items-center gap-4 rounded-lg p-2 hover:bg-torus-surface"
                >
                  <div
                    className="h-12 w-20 flex-shrink-0 rounded bg-torus-surface"
                    style={{
                      backgroundImage: clip.ogImageKey
                        ? `url(${storage.publicUrl(clip.ogImageKey)})`
                        : undefined,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {clip.title ?? <span className="opacity-50">untitled</span>}
                    </div>
                    <div className="mt-1 font-mono text-xs text-torus-fg-faint">
                      torus.wtf/{clip.shareCode}
                      {clip.durationMs ? ` · ${formatDuration(clip.durationMs)}` : ''}
                      {clip.playCount ? ` · ${clip.playCount} plays` : ''}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function formatDuration(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}`;
}
