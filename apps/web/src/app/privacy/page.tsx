import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';

export const metadata = {
  title: 'privacy',
  description: 'How torus.wtf handles your data.',
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-12">
      <SiteHeader />
      <h1 className="mt-12 text-3xl font-semibold tracking-tight">privacy</h1>

      <section className="mt-8 space-y-4 text-sm leading-relaxed text-torus-fg-dim">
        <p>
          torus.wtf is built to collect as little as possible. We do not run ads, sell data, or use
          third-party analytics by default. See{' '}
          <Link href="/principles" className="text-torus-mid underline">
            our principles
          </Link>{' '}
          for the full contract.
        </p>
        <p>
          <strong className="text-torus-fg">Sessions:</strong> when you sign in, we set an HttpOnly
          session cookie. No tracking cookies.
        </p>
        <p>
          <strong className="text-torus-fg">Email:</strong> magic-link sign-in and account-deletion
          rescue emails are sent via your operator&apos;s SMTP. We do not send marketing or nag
          campaigns.
        </p>
        <p>
          <strong className="text-torus-fg">Uploads:</strong> audio you upload is stored in
          object storage you or the host controls. Anonymous uploads get a claim token in your
          browser so you can manage them later.
        </p>
        <p>
          <strong className="text-torus-fg">Self-hosting:</strong> torus.wtf is AGPL. You can run
          your own instance and keep data on your infrastructure.
        </p>
      </section>

      <p className="mt-10 text-xs text-torus-fg-faint">
        <Link href="/terms" className="hover:text-torus-fg">
          Terms
        </Link>
        {' · '}
        <Link href="/" className="hover:text-torus-fg">
          Home
        </Link>
      </p>
    </main>
  );
}
