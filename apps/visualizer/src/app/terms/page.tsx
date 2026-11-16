import Link from 'next/link';
import { SiteFooter } from '@/components/SiteFooter';
import { SUPPORT_EMAIL, mailto } from '@/lib/constants';

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
          By using torus you agree to use it lawfully and not to abuse the service. torus is free
          and provided as a best-effort service with no uptime guarantee.
        </p>
        <p>
          <strong className="text-torus-fg">Your audio.</strong> You are responsible for having the
          rights to any audio you visualize. torus processes it in your browser and claims no
          ownership of it.
        </p>
        <p>
          <strong className="text-torus-fg">Your exports.</strong> Video and images you export are
          yours to use, including commercially. That covers the visuals torus generates. It does not
          give you rights to music you do not own.
        </p>
        <p>
          <strong className="text-torus-fg">Accounts.</strong> Accounts are optional. You can delete
          yours from{' '}
          <Link href="/settings" className="text-torus-mid underline">
            settings
          </Link>{' '}
          at any time.
        </p>
        <p>
          Questions?{' '}
          <a href={mailto(SUPPORT_EMAIL)} className="text-torus-mid underline">
            {SUPPORT_EMAIL}
          </a>
        </p>
      </section>

      <SiteFooter />
    </main>
  );
}
