import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { db, moderationLog } from '@/lib/db';
import { Logo } from '@torus/ui';

export const dynamic = 'force-dynamic';

export default async function PublicModerationLogPage() {
  const entries = await db
    .select()
    .from(moderationLog)
    .orderBy(desc(moderationLog.createdAt))
    .limit(200);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-12">
      <Link href="/" aria-label="torus.fm home">
        <Logo size={28} className="text-torus-fg" />
      </Link>
      <h1 className="mt-10 text-2xl font-semibold tracking-tight">moderation log</h1>
      <p className="mt-2 text-sm text-torus-fg-dim">
        Public, append-only record of moderation actions. No silent enforcement.
      </p>

      <ul className="mt-10 flex flex-col gap-4">
        {entries.length === 0 ? (
          <li className="rounded-xl border border-torus-border bg-torus-surface p-5 text-sm text-torus-fg-dim">
            Nothing here yet.
          </li>
        ) : (
          entries.map((e) => (
            <li
              key={e.id}
              className="rounded-xl border border-torus-border bg-torus-surface p-4 text-sm"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono uppercase tracking-wider text-torus-mid">
                  {e.action}
                </span>
                <time
                  className="font-mono text-torus-fg-faint"
                  dateTime={new Date(e.createdAt).toISOString()}
                >
                  {new Date(e.createdAt).toISOString().slice(0, 16).replace('T', ' ')} UTC
                </time>
              </div>
              {e.targetRef ? (
                <div className="mt-1 font-mono text-xs text-torus-fg-faint">{e.targetRef}</div>
              ) : null}
              <p className="mt-2 text-torus-fg">{e.publicReason}</p>
            </li>
          ))
        )}
      </ul>
    </main>
  );
}
