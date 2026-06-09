import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center px-6 py-20 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">This page doesn&apos;t exist.</h1>
      <p className="mt-10 text-xs text-torus-fg-faint">
        <Link href="/" className="hover:text-torus-fg">
          Home
        </Link>
        {' · '}
        <Link href="/about" className="hover:text-torus-fg">
          About
        </Link>
      </p>
    </main>
  );
}
