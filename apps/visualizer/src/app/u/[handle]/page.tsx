import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { eq, sql } from 'drizzle-orm';
import { db, users, handleHistory } from '@/lib/db';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { hasLicense } from '@/lib/license';

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
  return user;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  const user = await loadProfile(handle);
  if (!user) return { title: 'not found' };
  return {
    title: `@${user.handle}`,
    description: user.bio ?? `${user.handle} on torus`,
  };
}

export default async function ProfilePage({ params }: PageProps) {
  const { handle } = await params;
  const user = await loadProfile(handle);
  if (!user) notFound();

  const viewer = await getCurrentUserFromCookies();
  const isOwner = viewer?.id === user.id;
  const licensed = hasLicense(user);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-20">
      <section className="flex items-start gap-6">
        <div
          className="h-20 w-20 flex-shrink-0 rounded-full border border-torus-border-strong bg-torus-surface"
          style={{
            backgroundImage: user.avatarUrl ? `url(${user.avatarUrl})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            @{user.handle}
            {licensed ? (
              <span className="text-torus-high" title="Production License">
                ✦
              </span>
            ) : null}
          </h1>
          {licensed ? (
            <p className="mt-1 text-xs uppercase tracking-wide text-torus-high">
              Production License
            </p>
          ) : null}
          {user.bio ? (
            <p className="mt-3 max-w-prose text-sm text-torus-fg-dim">{user.bio}</p>
          ) : (
            <p className="mt-3 text-sm text-torus-fg-faint">No bio yet.</p>
          )}
        </div>
        {isOwner ? (
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
        ) : null}
      </section>

      {isOwner && !licensed ? (
        <Link
          href="/license"
          className="mt-10 rounded-2xl border border-torus-border-strong bg-torus-surface p-5 transition hover:border-torus-high/40"
        >
          <div className="text-sm font-medium text-torus-fg">Unlock the Production License ✦</div>
          <div className="mt-1 text-xs text-torus-fg-dim">
            1440p exports, high frame rates, no watermark, and commercial-use rights — one-time $10.
          </div>
        </Link>
      ) : null}
    </main>
  );
}
