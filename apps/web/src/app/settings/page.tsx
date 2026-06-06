import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { SiteHeader } from '@/components/SiteHeader';
import { SettingsForm } from './SettingsForm';

export const metadata = {
  title: 'settings',
  description: 'Profile and account settings for torus.wtf.',
};

export default async function SettingsPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect('/signin');

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-6 py-12">
      <SiteHeader initialUser={{ handle: user.handle }} />
      <h1 className="mt-12 text-3xl font-semibold tracking-tight">settings</h1>
      <p className="mt-2 text-sm text-torus-fg-dim">@{user.handle}</p>
      <SettingsForm
        initialUser={{
          id: user.id,
          handle: user.handle,
          email: user.email,
          avatarUrl: user.avatarUrl,
          bio: user.bio,
          customSubdomain: user.customSubdomain,
        }}
      />
    </main>
  );
}
