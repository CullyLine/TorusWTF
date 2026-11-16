import Link from 'next/link';
import { SiteFooter } from '@/components/SiteFooter';
import { SUPPORT_EMAIL, mailto } from '@/lib/constants';

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
          torus has no ads, sells no data, and loads no third-party analytics by default. The{' '}
          <Link href="/principles" className="text-torus-mid underline">
            principles
          </Link>{' '}
          page lists every commitment.
        </p>
        <p>
          <strong className="text-torus-fg">Your audio stays on your device.</strong> Capture,
          analysis, and rendering happen in your browser. torus does not upload or store the audio
          you visualize.
        </p>
        <p>
          <strong className="text-torus-fg">Your settings stay in your browser.</strong> Looks,
          saved presets, and export options are kept in local storage on your device.
        </p>
        <p>
          <strong className="text-torus-fg">Accounts are optional.</strong> If you sign in, torus
          stores your email or Discord id, your handle, and the profile details you add. An HttpOnly
          session cookie keeps you signed in. There are no tracking cookies.
        </p>
        <p>
          <strong className="text-torus-fg">Email is for sign-in only.</strong> torus sends the
          sign-in link you ask for and no marketing.
        </p>
        <p>
          <strong className="text-torus-fg">Past purchases.</strong> torus used to sell a one-time
          license through Polar. If you bought one, your account still holds the purchase date and
          order id. torus never received your card details.
        </p>
        <p>
          You can delete your account and all of its data from{' '}
          <Link href="/settings" className="text-torus-mid underline">
            settings
          </Link>
          .
        </p>
        <p>
          Questions about privacy or your data?{' '}
          <a href={mailto(SUPPORT_EMAIL)} className="text-torus-mid underline">
            {SUPPORT_EMAIL}
          </a>
        </p>
      </section>

      <SiteFooter />
    </main>
  );
}
