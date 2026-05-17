import { NextResponse, type NextRequest } from 'next/server';

/**
 * Custom-subdomain routing.
 *
 * If a request hits `yourname.torus.fm`, we rewrite to `/u/yourname` so
 * supporter profiles get a vanity URL. Apex domain + reserved subdomains
 * (www, api, media, etc.) pass through unchanged.
 *
 * The `app/u/[handle]/page.tsx` route already looks up by handle, so the
 * actual mapping (handle vs custom_subdomain) is resolved there with a fall-
 * through to the handle field if no custom subdomain match exists.
 */

const RESERVED = new Set([
  'www',
  'admin',
  'api',
  'media',
  'static',
  'mail',
  'help',
  'support',
  'about',
  'signin',
  'signup',
  'login',
  'auth',
  'charts',
  'moderation',
  'embed',
  'u',
  'localhost',
]);

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const host = req.headers.get('host')?.toLowerCase() ?? '';
  const hostNoPort = host.split(':')[0]!;
  const labels = hostNoPort.split('.');

  // Need at least three labels to be a subdomain of an apex domain (sub.domain.tld)
  if (labels.length < 3) return NextResponse.next();
  const sub = labels[0]!;
  if (RESERVED.has(sub)) return NextResponse.next();

  // Don't rewrite API / asset / Next.js internal paths
  if (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/_next') ||
    url.pathname.startsWith('/embed/') ||
    /\.[a-z0-9]+$/i.test(url.pathname)
  ) {
    return NextResponse.next();
  }

  // Rewrite root requests on the subdomain to /u/<sub>
  if (url.pathname === '/' || url.pathname === '') {
    const rewritten = url.clone();
    rewritten.pathname = `/u/${sub}`;
    return NextResponse.rewrite(rewritten);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
