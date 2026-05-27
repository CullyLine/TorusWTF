import Link from 'next/link';
import { Logo } from '@torus/ui';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <Logo size={80} className="text-torus-fg-faint" />
      <h1 className="mt-10 text-3xl font-semibold tracking-tight">nothing here</h1>
      <p className="mt-4 text-sm text-torus-fg-dim">
        The clip you're looking for might have been removed, or the share code is wrong.
      </p>
      <Link
        href="/"
        className="mt-10 rounded-full bg-torus-fg px-6 py-3 text-sm font-medium text-torus-bg hover:opacity-90"
      >
        back to torus.wtf
      </Link>
    </main>
  );
}
