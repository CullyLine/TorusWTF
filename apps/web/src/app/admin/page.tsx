import Link from 'next/link';
import { and, desc, eq } from 'drizzle-orm';
import { db, reports, clips, users } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export default async function AdminIndexPage() {
  await requireAdmin();

  const openReports = await db
    .select({
      id: reports.id,
      reason: reports.reason,
      body: reports.body,
      createdAt: reports.createdAt,
      shareCode: clips.shareCode,
      title: clips.title,
      reporterHandle: users.handle,
    })
    .from(reports)
    .leftJoin(clips, eq(reports.clipId, clips.id))
    .leftJoin(users, eq(reports.reporterId, users.id))
    .where(eq(reports.status, 'open'))
    .orderBy(desc(reports.createdAt))
    .limit(100);

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6 py-12">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">admin</h1>
        <nav className="flex gap-2 text-sm">
          <Link
            href="/admin/health"
            className="rounded-full border border-torus-border-strong px-4 py-2 hover:bg-torus-surface"
          >
            instance health
          </Link>
        </nav>
      </header>

      <section>
        <h2 className="mb-4 text-lg font-semibold">open reports</h2>
        {openReports.length === 0 ? (
          <p className="rounded-xl border border-torus-border bg-torus-surface p-6 text-sm text-torus-fg-dim">
            No open reports. Inbox zero.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {openReports.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-torus-border bg-torus-surface p-4 text-sm"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono uppercase tracking-wider text-torus-bass">
                    {r.reason}
                  </span>
                  <time
                    dateTime={new Date(r.createdAt).toISOString()}
                    className="font-mono text-torus-fg-faint"
                  >
                    {new Date(r.createdAt).toISOString().slice(0, 16).replace('T', ' ')} UTC
                  </time>
                </div>
                {r.body ? <p className="mt-2 text-torus-fg-dim">{r.body}</p> : null}
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                  {r.shareCode ? (
                    <Link
                      href={`/${r.shareCode}`}
                      className="rounded-full bg-torus-bg px-3 py-1 hover:bg-torus-surface"
                    >
                      view clip · {r.shareCode}
                    </Link>
                  ) : null}
                  {r.title ? <span className="text-torus-fg-faint">“{r.title}”</span> : null}
                  {r.reporterHandle ? (
                    <span className="text-torus-fg-faint">by @{r.reporterHandle}</span>
                  ) : (
                    <span className="text-torus-fg-faint">anonymous</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
