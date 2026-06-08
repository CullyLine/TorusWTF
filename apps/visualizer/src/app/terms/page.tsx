import Link from 'next/link';

export const metadata = {
  title: 'terms',
  description: 'Terms of use for torus.',
};

export default function TermsPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-20">
      <h1 className="text-3xl font-semibold tracking-tight">terms</h1>

      <section className="mt-8 space-y-4 text-sm leading-relaxed text-torus-fg-dim">
        <p>
          By using torus you agree to use it lawfully and not to abuse the service. The core
          visualizer and tools are provided free, as a best-effort service with no SLA.
        </p>
        <p>
          <strong className="text-torus-fg">Your content:</strong> you’re responsible for having the
          rights to any audio you visualize and to any video you export. torus processes audio
          locally and claims no ownership of your work.
        </p>
        <p>
          <strong className="text-torus-fg">Production License:</strong> a one-time, account-bound
          purchase that unlocks the highest-quality exports, removes the watermark, and grants you
          permission to use your torus exports commercially. It’s a license to the output you create
          here — not a transfer of rights to any music you don’t own.
        </p>
        <p>
          <strong className="text-torus-fg">Free exports</strong> are watermarked, capped in
          resolution and frame rate, and intended for personal, non-commercial use.
        </p>
        <p>
          <strong className="text-torus-fg">Account deletion:</strong> delete your account anytime
          from{' '}
          <Link href="/settings" className="text-torus-mid underline">
            settings
          </Link>
          . No dark patterns.
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
