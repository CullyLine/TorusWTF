import Link from 'next/link';
import { Logo } from '@torus/ui';
import { SupporterPanel } from './SupporterPanel';
import { getCurrentUserFromCookies } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function SupportPage() {
  const user = await getCurrentUserFromCookies();
  const polarConfigured = Boolean(process.env.POLAR_API_KEY && process.env.POLAR_WEBHOOK_SECRET);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-12">
      <Logo size={28} className="text-torus-fg" />

      <h1 className="mt-10 text-3xl font-semibold tracking-tight">support torus.fm</h1>
      <p className="mt-3 max-w-prose text-sm text-torus-fg-dim">
        torus.fm is a passion project, not a startup. There are no ads, no data sales, no VC
        funding. The site survives on small donations and an optional Supporter tier. Whatever feels
        right.
      </p>

      <section className="mt-12 rounded-2xl border border-torus-border-strong bg-torus-surface p-6">
        <h2 className="text-lg font-semibold">supporter</h2>
        <p className="mt-1 text-sm text-torus-fg-dim">
          $3 / month or $30 / year. The free tier always stays useful — see{' '}
          <Link href="/principles" className="underline">
            PRINCIPLES
          </Link>
          .
        </p>
        <ul className="mt-4 space-y-1.5 text-sm text-torus-fg">
          <li>
            · vanity custom subdomain (<span className="font-mono">yourname.torus.fm</span>)
          </li>
          <li>· small ★ next to your handle</li>
          <li>· first dibs on perks the community designs (your $ literally pays for the box)</li>
        </ul>
        <div className="mt-6">
          {polarConfigured ? (
            <SupporterPanel currentUser={user} />
          ) : (
            <p className="text-xs text-torus-fg-faint">
              Supporter tier isn’t configured on this self-hosted instance.
            </p>
          )}
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-torus-border bg-torus-surface p-6">
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
