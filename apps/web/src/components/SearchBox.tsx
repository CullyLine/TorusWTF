'use client';

/** Minimal search — full implementation in PR 9. */
export function SearchBox({ className }: { className?: string }) {
  return (
    <form action="/search" method="get" className={className ?? 'hidden sm:block'}>
      <input
        type="search"
        name="q"
        placeholder="search…"
        aria-label="Search clips and people"
        className="w-36 rounded-full border border-torus-border-strong bg-torus-surface px-3 py-1.5 text-xs text-torus-fg placeholder:text-torus-fg-faint focus:w-44 focus:outline-none focus:ring-1 focus:ring-torus-mid transition-[width]"
      />
    </form>
  );
}
