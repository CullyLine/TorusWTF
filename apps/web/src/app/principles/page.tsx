import Link from 'next/link';
import { Logo } from '@torus/ui';

export const metadata = {
  title: 'principles',
  description: 'The no-bullshit charter that defines what torus.fm will and will not do.',
};

export default function PrinciplesPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-12">
      <Link href="/" aria-label="torus.fm home">
        <Logo size={32} className="text-torus-fg" />
      </Link>

      <h1 className="mt-10 text-3xl font-semibold tracking-tight">principles</h1>
      <p className="mt-3 text-sm text-torus-fg-dim">
        A hard contract with users. Every proposed feature must justify itself against this list.
        The canonical version lives in{' '}
        <a
          href="https://github.com/YOUR_ORG/torus/blob/main/PRINCIPLES.md"
          className="underline"
          target="_blank"
          rel="noreferrer"
        >
          PRINCIPLES.md
        </a>{' '}
        on GitHub.
      </p>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">we will never</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-torus-fg-dim">
          <li>show ads, sponsored placements, or "featured" anything paid for</li>
          <li>run an algorithmic feed engineered for engagement</li>
          <li>sell user data, ever</li>
          <li>train AI models on uploaded clips without explicit per-clip opt-in</li>
          <li>gate core features (upload, share, waveform, visualizers) behind "premium"</li>
          <li>run notification/email nag campaigns</li>
          <li>use dark patterns in unsubscribe / account-deletion flows</li>
          <li>set tracking cookies or load third-party analytics by default</li>
          <li>surface engagement metrics in shame-driven ways</li>
          <li>take VC funding (the Clyp.it death spiral)</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">we will always</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-torus-fg-dim">
          <li>keep core features free, forever</li>
          <li>be self-hostable — anyone can run their own instance</li>
          <li>be open source under AGPL-3.0</li>
          <li>treat accessibility bugs like security bugs</li>
          <li>respect your attention (minimal default share page)</li>
          <li>publish a transparent moderation log — no silent enforcement</li>
          <li>be honest about uptime — "best-effort free service"</li>
        </ul>
      </section>

      <p className="mt-12 text-xs text-torus-fg-faint">
        These principles outlive any maintainer. They are a public commitment, not a marketing line.
      </p>
    </main>
  );
}
