import Link from 'next/link';
import { desc, sql } from 'drizzle-orm';
import { db, weeklyCharts } from '@/lib/db';
import { Logo } from '@torus/ui';

export const dynamic = 'force-dynamic';

export default async function ChartsIndexPage() {
  const rows = await db
    .selectDistinct({ weekBucket: weeklyCharts.weekBucket })
    .from(weeklyCharts)
    .orderBy(desc(weeklyCharts.weekBucket))
    .limit(52);
  void sql;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-12">
      <Logo size={28} className="text-torus-fg" />
      <h1 className="mt-10 text-2xl font-semibold tracking-tight">weekly chart history</h1>
      <p className="mt-2 text-sm text-torus-fg-dim">Snapshots taken every Monday at 00:00 UTC.</p>
      <ul className="mt-8 flex flex-col divide-y divide-torus-border">
        {rows.length === 0 ? (
          <li className="py-4 text-sm text-torus-fg-dim">No archived charts yet.</li>
        ) : (
          rows.map((row) => {
            const m = /^(\d{4})-W(\d{2})$/.exec(row.weekBucket);
            const year = m?.[1];
            const week = m?.[2];
            if (!year || !week) return null;
            return (
              <li key={row.weekBucket} className="py-3">
                <Link
                  href={`/charts/${year}/${week}`}
                  className="block rounded p-2 font-mono text-sm hover:bg-torus-surface"
                >
                  {row.weekBucket}
                </Link>
              </li>
            );
          })
        )}
      </ul>
    </main>
  );
}
