import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';

export const metadata = {
  title: 'terms',
  description: 'Terms of use for torus.fm.',
};

export default function TermsPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-12">
      <SiteHeader />
      <h1 className="mt-12 text-3xl font-semibold tracking-tight">terms</h1>

      <section className="mt-8 space-y-4 text-sm leading-relaxed text-torus-fg-dim">
        <p>
          By using torus.fm you agree not to upload illegal content or abuse the service. Operators
          may remove clips and ban accounts per the public{' '}
          <Link href="/moderation" className="text-torus-mid underline">
            moderation log
          </Link>
          .
        </p>
        <p>
          Core features — upload, share, waveform, 3D visualizers, community voting — stay free.
          See{' '}
          <Link href="/principles" className="text-torus-mid underline">
            PRINCIPLES.md
          </Link>{' '}
          (mirrored at /principles) for what we will never do.
        </p>
        <p>
          <strong className="text-torus-fg">Software license:</strong> the torus.fm codebase is
          licensed under AGPL-3.0-or-later. Self-hosted instances must comply with AGPL when
          offering network access to modified versions.
        </p>
        <p>
          <strong className="text-torus-fg">Account deletion:</strong> you can delete your account
          from{' '}
          <Link href="/settings" className="text-torus-mid underline">
            settings
          </Link>
          . Choose anonymize (clips stay up) or delete everything. No dark patterns.
        </p>
      </section>

      <p className="mt-10 text-xs text-torus-fg-faint">
        <Link href="/privacy" className="hover:text-torus-fg">
          Privacy
        </Link>
        {' · '}
        <Link href="/" className="hover:text-torus-fg">
          Home
        </Link>
      </p>
    </main>
  );
}
