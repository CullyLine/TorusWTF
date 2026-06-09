import Link from 'next/link';

export const metadata = {
  title: 'principles',
  description: 'The contract that defines what torus will and will not do.',
};

export default function PrinciplesPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-20">
      <h1 className="text-3xl font-semibold tracking-tight">principles</h1>
      <p className="mt-3 text-sm text-torus-fg-dim">
        A short, honest contract with the people who use torus. Every feature has to justify itself
        against this list.
      </p>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">we will never</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-torus-fg-dim">
          <li>show ads or sponsored placements</li>
          <li>sell or rent your data</li>
          <li>run an engagement-bait algorithmic feed</li>
          <li>load third-party trackers by default</li>
          <li>use dark patterns in sign-up, billing, or account deletion</li>
          <li>gate the core tools behind a subscription</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">we will always</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-torus-fg-dim">
          <li>keep the core visualizer and tools free</li>
          <li>keep paid features cosmetic or quality-of-life — never the essentials</li>
          <li>charge once, plainly, when we charge at all (the Production License)</li>
          <li>let you delete your account and data, no hoops</li>
          <li>treat accessibility bugs like real bugs</li>
          <li>be honest about uptime — best-effort, no false promises</li>
        </ul>
      </section>

      <p className="mt-12 text-xs text-torus-fg-faint">
        The only thing we ever ask money for is the optional{' '}
        <Link href="/license" className="underline">
          Production License
        </Link>{' '}
        — a one-time unlock for high-quality, commercial-ready exports.
      </p>

      <p className="mt-10 text-xs text-torus-fg-faint">
        <Link href="/" className="hover:text-torus-fg">
          Home
        </Link>
        {' · '}
        <Link href="/about" className="hover:text-torus-fg">
          About
        </Link>
        {' · '}
        <Link href="/principles" className="hover:text-torus-fg">
          Principles
        </Link>
        {' · '}
        <Link href="/privacy" className="hover:text-torus-fg">
          Privacy
        </Link>
        {' · '}
        <Link href="/terms" className="hover:text-torus-fg">
          Terms
        </Link>
      </p>
    </main>
  );
}
