import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { ClipRow } from '@/components/ClipRow';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { runSearch } from '@/lib/search';

export const dynamic = 'force-dynamic';

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q: rawQ } = await searchParams;
  const q = rawQ?.trim() ?? '';
  const sessionUser = await getCurrentUserFromCookies();
  const results = q ? await runSearch(q) : { clips: [], users: [] };

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6 py-12">
      <SiteHeader initialUser={sessionUser ? { handle: sessionUser.handle } : null} />

      <h1 className="mt-12 text-2xl font-semibold tracking-tight">search</h1>

      <form action="/search" method="get" className="mt-6">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="clips, handles…"
          className="w-full rounded-lg border border-torus-border-strong bg-torus-surface px-4 py-3 text-sm"
        />
      </form>

      {q ? (
        <>
          <section className="mt-10">
            <h2 className="text-lg font-semibold">clips</h2>
            {results.clips.length === 0 ? (
              <p className="mt-4 text-sm text-torus-fg-dim">No clips found.</p>
            ) : (
              <ol className="mt-4 flex flex-col divide-y divide-torus-border">
                {results.clips.map((entry) => (
                  <ClipRow key={entry.clipId} entry={entry} />
                ))}
              </ol>
            )}
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-semibold">people</h2>
            {results.users.length === 0 ? (
              <p className="mt-4 text-sm text-torus-fg-dim">No people found.</p>
            ) : (
              <ul className="mt-4 flex flex-col divide-y divide-torus-border">
                {results.users.map((u) => (
                  <li key={u.id} className="py-3">
                    <Link
                      href={`/u/${u.handle}`}
                      className="flex items-center gap-3 rounded-lg p-2 hover:bg-torus-surface"
                    >
                      <div
                        className="h-10 w-10 rounded-full border border-torus-border-strong bg-torus-surface"
                        style={{
                          backgroundImage: u.avatarUrl ? `url(${u.avatarUrl})` : undefined,
                          backgroundSize: 'cover',
                        }}
                        aria-hidden
                      />
                      <div>
                        <span className="font-medium">
                          @{u.handle}
                          {u.tier === 'supporter' ? (
                            <span className="ml-1 text-torus-mid">★</span>
                          ) : null}
                        </span>
                        {u.bio ? (
                          <p className="mt-0.5 line-clamp-1 text-xs text-torus-fg-dim">{u.bio}</p>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <p className="mt-8 text-sm text-torus-fg-dim">Enter a search term above.</p>
      )}
    </main>
  );
}
