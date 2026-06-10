import Link from 'next/link';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { SUPPORT_EMAIL, mailto } from '@/lib/constants';
import { hasLicense, licenseConfigured, LICENSE_BENEFITS, LICENSE_PRICE_USD } from '@/lib/license';
import { LicenseBuyButton } from './LicenseBuyButton';
import { LicensePostCheckout } from './LicensePostCheckout';

export const metadata = {
  title: 'Production License',
  description:
    'A one-time $10 Production License: highest-quality exports, no watermark, and commercial-use rights across torus.',
};

interface PageProps {
  searchParams: Promise<{ success?: string }>;
}

export default async function LicensePage({ searchParams }: PageProps) {
  const { success } = await searchParams;
  const user = await getCurrentUserFromCookies();
  const licensed = hasLicense(user);
  const configured = licenseConfigured();

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-6 py-20">
      <p className="text-xs uppercase tracking-[0.2em] text-torus-high">one-time · account-bound</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Production License</h1>
      <p className="mt-3 text-sm text-torus-fg-dim">
        Everything on torus is free. The Production License is a single ${LICENSE_PRICE_USD} purchase
        that unlocks the highest-quality output and the right to use your exports commercially —
        across the whole site, forever.
      </p>

      <ul className="mt-8 space-y-3">
        {LICENSE_BENEFITS.map((benefit) => (
          <li key={benefit} className="flex items-start gap-3 text-sm text-torus-fg">
            <span className="mt-0.5 text-torus-high">✦</span>
            {benefit}
          </li>
        ))}
      </ul>

      <div className="mt-10">
        {success ? (
          <LicensePostCheckout />
        ) : licensed ? (
          <div className="rounded-2xl border border-torus-high/40 bg-torus-surface p-5 text-sm">
            <p className="font-medium text-torus-high">You have the Production License ✦</p>
            <p className="mt-1 text-torus-fg-dim">
              All pro exports and commercial-use rights are unlocked on this account.
            </p>
          </div>
        ) : !user ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-torus-fg-dim">
              The license is bound to your account, so you'll need to sign in first.
            </p>
            <Link
              href="/signin"
              className="self-start rounded-full bg-torus-fg px-6 py-3 text-sm font-medium text-torus-bg"
            >
              Sign in to continue
            </Link>
          </div>
        ) : (
          <LicenseBuyButton configured={configured} />
        )}
      </div>

      <p className="mt-12 text-xs text-torus-fg-faint">
        Free exports are watermarked and capped in resolution and frame rate. The license lifts those
        caps and grants commercial use — see{' '}
        <Link href="/terms" className="underline">
          terms
        </Link>
        . Questions about your purchase?{' '}
        <a href={mailto(SUPPORT_EMAIL)} className="underline">
          {SUPPORT_EMAIL}
        </a>
        .
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
