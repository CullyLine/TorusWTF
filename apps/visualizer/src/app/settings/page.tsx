import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { hasLicense } from '@/lib/license';
import { SettingsForm } from './SettingsForm';

export const metadata = {
  title: 'settings',
  description: 'Profile and account settings for torus.',
};

export default async function SettingsPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect('/signin?next=/settings');

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-6 py-20">
      <h1 className="text-3xl font-semibold tracking-tight">settings</h1>
      <p className="mt-2 text-sm text-torus-fg-dim">
        @{user.handle}
        {hasLicense(user) ? <span className="ml-2 text-torus-high">Production License ✦</span> : null}
      </p>
      <SettingsForm
        initialUser={{
          id: user.id,
          handle: user.handle,
          email: user.email,
          avatarUrl: user.avatarUrl,
          bio: user.bio,
          customSubdomain: user.customSubdomain,
          hasLicense: hasLicense(user),
        }}
      />
    </main>
  );
}
