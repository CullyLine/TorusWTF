import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { db, weeklyCharts, clips, users } from '@/lib/db';
import { storage } from '@/lib/storage';
import { SiteHeader } from '@/components/SiteHeader';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ year: string; week: string }>;
}

export default async function ChartPage({ params }: PageProps) {
  const { year, week } = await params;
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(week)) notFound();
  const bucket = `${year}-W${week}`;

  const rows = await db
    .select({
      rank: weeklyCharts.rank,
      voteCount: weeklyCharts.voteCount,
      shareCode: clips.shareCode,
      title: clips.title,
      ownerHandle: users.handle,
      ogImageKey: clips.ogImageKey,
    })
    .from(weeklyCharts)
    .innerJoin(clips, eq(weeklyCharts.clipId, clips.id))
    .leftJoin(users, eq(clips.ownerId, users.id))
    .where(and(eq(weeklyCharts.weekBucket, bucket)))
    .orderBy(asc(weeklyCharts.rank));

  if (rows.length === 0) notFound();

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-12">
      <SiteHeader logoSize={28} />
      <h1 className="mt-12 font-mono text-2xl font-semibold">{bucket}</h1>
      <p className="mt-1 text-sm text-torus-fg-dim">Top clips that week</p>

      <ol className="mt-8 flex flex-col divide-y divide-torus-border">
        {rows.map((row) => (
          <li key={row.shareCode} className="py-3">
            <Link
              href={`/${row.shareCode}`}
              className="flex items-center gap-4 rounded-lg p-2 hover:bg-torus-surface"
            >
              <span className="w-8 text-center font-mono text-sm text-torus-fg-faint">
                {row.rank}
              </span>
              <div
                className="h-10 w-16 flex-shrink-0 rounded bg-torus-surface"
                style={{
                  backgroundImage: row.ogImageKey
                    ? `url(${storage.publicUrl(row.ogImageKey)})`
                    : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {row.title ?? <span className="opacity-50">untitled</span>}
                </div>
                <div className="mt-1 font-mono text-xs text-torus-fg-faint">
                  {row.ownerHandle ? `@${row.ownerHandle}` : 'anonymous'}
                </div>
              </div>
              <span className="font-mono text-sm text-torus-fg-dim">{row.voteCount} votes</span>
            </Link>
          </li>
        ))}
      </ol>

      <p className="mt-12 text-center text-xs text-torus-fg-faint">
        <Link href="/charts" className="hover:text-torus-fg">
          ← back to charts
        </Link>
      </p>
    </main>
  );
}
