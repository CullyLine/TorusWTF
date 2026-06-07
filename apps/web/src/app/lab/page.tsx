import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { getBalance } from '@/lib/credits';
import { SiteHeader } from '@/components/SiteHeader';
import { SERVICES } from '@torus/shared';
import { LabApp } from './LabApp';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'lab — torus.wtf',
  description: 'Compute-heavy music tools billed at cost with credits. Stem separation and more.',
};

export default async function LabPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect('/signin');

  const balance = getBalance(user.id);
  const services = Object.values(SERVICES).map((s) => ({
    id: s.id,
    label: s.label,
    description: s.description,
    creditCost: s.creditCost,
    maxInputBytes: s.maxInputBytes,
  }));

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6 py-10">
      <SiteHeader initialUser={{ handle: user.handle }} />
      <LabApp initialBalance={balance} services={services} />
    </main>
  );
}
