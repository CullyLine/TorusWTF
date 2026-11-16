import Link from 'next/link';
import type { Route } from 'next';

const LINKS: { href: Route; label: string }[] = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/principles', label: 'Principles' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
];

/** Link row at the bottom of the static pages (about, principles, privacy, terms). */
export function SiteFooter() {
  return (
    <nav
      aria-label="Site"
      className="mt-10 flex flex-wrap gap-x-4 gap-y-1 text-xs text-torus-fg-faint"
    >
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} className="hover:text-torus-fg">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
