import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { listApiKeys } from '@/lib/api-keys';
import { getBalance } from '@/lib/credits';
import { SiteHeader } from '@/components/SiteHeader';
import { DeveloperApp } from './DeveloperApp';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'developers — torus.wtf',
  description: 'API keys and docs for the TorusFM compute API.',
};

export default async function DeveloperPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect('/signin');

  const keys = listApiKeys(user.id);
  const balance = getBalance(user.id);
  const baseUrl = process.env.PUBLIC_URL ?? 'https://torus.wtf';

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-10">
      <SiteHeader initialUser={{ handle: user.handle }} />
      <DeveloperApp
        initialKeys={keys.map((k) => ({
          id: k.id,
          name: k.name,
          prefix: k.prefix,
          lastUsedAt: k.lastUsedAt,
          createdAt: k.createdAt,
        }))}
        balance={balance}
        baseUrl={baseUrl}
      />
    </main>
  );
}
