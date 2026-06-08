import Link from 'next/link';
import { SignInForm } from './SignInForm';

export const metadata = {
  title: 'sign in',
  description: 'Sign in to torus — save presets, claim your profile, manage your Production License.',
};

interface PageProps {
  searchParams: Promise<{ error?: string; sent?: string }>;
}

export default async function SignInPage({ searchParams }: PageProps) {
  const { error, sent } = await searchParams;
  const discordConfigured = Boolean(
    process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET,
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-20">
      <h1 className="text-2xl font-semibold tracking-tight">sign in</h1>
      <p className="mt-3 text-center text-sm text-torus-fg-dim">
        The visualizer works without an account. Sign in to save presets, claim a profile, and
        manage your Production License.
      </p>

      <div className="mt-10 flex w-full flex-col gap-4">
        <SignInForm initialSent={sent === '1'} initialError={error ?? null} />

        {discordConfigured ? (
          <>
            <div className="my-2 flex items-center gap-3 text-xs text-torus-fg-faint">
              <span className="h-px flex-1 bg-torus-border" /> or{' '}
              <span className="h-px flex-1 bg-torus-border" />
            </div>
            <a
              href="/api/auth/discord"
              className="rounded-full border border-torus-border-strong px-5 py-3 text-center text-sm text-torus-fg hover:bg-torus-surface"
            >
              Continue with Discord
            </a>
          </>
        ) : null}
      </div>

      <p className="mt-12 text-xs text-torus-fg-faint">
        By signing in you agree to our{' '}
        <Link href="/terms" className="underline">
          terms
        </Link>{' '}
        and{' '}
        <Link href="/privacy" className="underline">
          privacy
        </Link>
        .
      </p>
    </main>
  );
}
