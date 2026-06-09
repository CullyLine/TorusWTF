import Link from 'next/link';

export const metadata = {
  title: 'privacy',
  description: 'How torus handles your data.',
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-20">
      <h1 className="text-3xl font-semibold tracking-tight">privacy</h1>

      <section className="mt-8 space-y-4 text-sm leading-relaxed text-torus-fg-dim">
        <p>
          torus collects as little as possible. No ads, no data sales, no third-party analytics by
          default. See{' '}
          <Link href="/principles" className="text-torus-mid underline">
            our principles
          </Link>{' '}
          for the full contract.
        </p>
        <p>
          <strong className="text-torus-fg">Your audio stays on your device.</strong> Capture,
          analysis, and rendering happen in your browser. We don’t upload or store the audio you
          visualize.
        </p>
        <p>
          <strong className="text-torus-fg">Accounts:</strong> if you sign in, we store your email
          (or Discord id), a handle, and an HttpOnly session cookie. That’s it. No tracking cookies.
        </p>
        <p>
          <strong className="text-torus-fg">Email:</strong> magic-link sign-in is sent via the
          operator’s SMTP. We don’t send marketing or nag campaigns.
        </p>
        <p>
          <strong className="text-torus-fg">Payments:</strong> the Production License is processed by
          Polar. We store only whether your account is licensed and the order id — never card
          details.
        </p>
        <p>
          You can delete your account and its data anytime from{' '}
          <Link href="/settings" className="text-torus-mid underline">
            settings
          </Link>
          .
        </p>
      </section>

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
