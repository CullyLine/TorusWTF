import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { getBalance, listLedger } from '@/lib/credits';
import { SiteHeader } from '@/components/SiteHeader';
import { CREDIT_PACKS, creditsConfigured, packProductId } from '@/lib/credit-packs';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'credits — torus.wtf',
  description: 'Top up prepaid credits for Lab compute services.',
};

const REASON_LABEL: Record<string, string> = {
  topup: 'Top-up',
  signup_bonus: 'Signup bonus',
  job_reserve: 'Job',
  job_refund: 'Refund',
  adjustment: 'Adjustment',
};

export default async function CreditsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect('/signin');

  const { ok, error } = await searchParams;
  const balance = getBalance(user.id);
  const ledger = listLedger(user.id, 25);
  const configured = creditsConfigured();

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-10">
      <SiteHeader initialUser={{ handle: user.handle }} />

      <div className="mt-10 flex items-end justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">credits</h1>
        <div className="text-right">
          <div className="text-xs text-torus-fg-faint">balance</div>
          <div className="text-2xl font-semibold text-torus-mid">{balance} cr</div>
        </div>
      </div>
      <p className="mt-2 text-sm text-torus-fg-dim">
        1 credit = 1¢. Credits pay for compute-heavy{' '}
        <a href="/lab" className="underline">
          Lab
        </a>{' '}
        tools at cost. The creative apps stay free.
      </p>

      {ok ? (
        <p className="mt-4 rounded-lg border border-torus-mid/40 bg-torus-mid/5 px-4 py-2 text-sm text-torus-mid">
          Payment received — your credits will appear within a few seconds.
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-lg border border-torus-bass/40 bg-torus-bass/5 px-4 py-2 text-sm text-torus-bass">
          {error === 'not_configured'
            ? 'Credit top-ups are not configured on this instance yet.'
            : 'Checkout failed. Please try again.'}
        </p>
      ) : null}

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        {CREDIT_PACKS.map((p) => {
          const available = configured && Boolean(packProductId(p));
          return (
            <a
              key={p.id}
              href={available ? `/api/billing/credits/checkout?pack=${p.id}` : undefined}
              aria-disabled={!available}
              className={`rounded-xl border p-5 text-center transition-colors ${
                available
                  ? 'border-torus-border-strong hover:border-torus-mid/50'
                  : 'pointer-events-none border-torus-border opacity-50'
              }`}
            >
              <div className="text-sm text-torus-fg-dim">{p.label}</div>
              <div className="mt-1 text-2xl font-semibold">{p.credits}</div>
              <div className="text-xs text-torus-fg-faint">credits</div>
              <div className="mt-3 text-sm font-medium text-torus-mid">${p.priceUsd}</div>
            </a>
          );
        })}
      </section>

      {!configured ? (
        <p className="mt-4 text-xs text-torus-fg-faint">
          Top-ups aren’t configured on this instance. Set POLAR_API_KEY and the
          POLAR_CREDITS_PRODUCT_* env vars to enable purchasing.
        </p>
      ) : null}

      <section className="mt-12">
        <h2 className="text-sm font-medium text-torus-fg-dim">Recent activity</h2>
        {ledger.length === 0 ? (
          <p className="mt-3 text-sm text-torus-fg-faint">No credit activity yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-torus-border text-sm">
            {ledger.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2">
                <span className="text-torus-fg-dim">
                  {REASON_LABEL[e.reason] ?? e.reason}
                  <span className="ml-2 text-xs text-torus-fg-faint">
                    {new Date(e.createdAt).toLocaleString()}
                  </span>
                </span>
                <span className={e.delta >= 0 ? 'text-torus-mid' : 'text-torus-fg'}>
                  {e.delta >= 0 ? '+' : ''}
                  {e.delta} cr
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
