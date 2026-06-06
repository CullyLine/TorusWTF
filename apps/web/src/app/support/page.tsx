import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { getCurrentUserFromCookies } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function SupportPage() {
  const user = await getCurrentUserFromCookies();

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-12">
      <SiteHeader logoSize={28} initialUser={user ? { handle: user.handle } : null} />
      <h1 className="mt-12 text-3xl font-semibold tracking-tight">support torus.wtf</h1>
      <p className="mt-3 max-w-prose text-sm text-torus-fg-dim">
        torus.wtf is a passion project, not a startup. There are no ads, no data sales, no VC
        funding. Every creative app — Visualizer, Conductor, Transcriber — is free. The compute-heavy
        Lab services run on prepaid credits at cost. If you want to chip in beyond that, here are some
        ways. Whatever feels right. See{' '}
        <Link href="/principles" className="underline">
          PRINCIPLES
        </Link>
        .
      </p>

      <section className="mt-12 rounded-2xl border border-torus-border bg-torus-surface p-6">
        <h2 className="text-lg font-semibold">other ways to help</h2>
        <ul className="mt-4 flex flex-col gap-2 text-sm">
          <li>
            <a
              href="https://github.com/sponsors"
              className="underline"
              target="_blank"
              rel="noreferrer"
            >
              GitHub Sponsors
            </a>{' '}
            — one-time or monthly
          </li>
          <li>
            <a
              href="https://opencollective.com"
              className="underline"
              target="_blank"
              rel="noreferrer"
            >
              Open Collective
            </a>{' '}
            — fully public ledger
          </li>
          <li>
            <a href="https://ko-fi.com" className="underline" target="_blank" rel="noreferrer">
              Ko-fi
            </a>{' '}
            — buy the maintainer a coffee
          </li>
          <li>
            Contribute on{' '}
            <a href="https://github.com" className="underline" target="_blank" rel="noreferrer">
              GitHub
            </a>{' '}
            — visualizer presets and storage drivers are great first PRs
          </li>
          <li>Self-host an instance — keeps the protocol alive even if the main hub goes down</li>
        </ul>
      </section>

      <p className="mt-12 text-center text-xs text-torus-fg-faint">
        ♥ for everyone who shared a clip with a friend.
      </p>
    </main>
  );
}
