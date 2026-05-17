import { NextResponse } from 'next/server';
import { clearSessionCookie, invalidateSession, SESSION_COOKIE_NAME } from '@/lib/auth';

export async function POST(req: Request) {
  const token = readCookie(req, SESSION_COOKIE_NAME);
  if (token) {
    try {
      await invalidateSession(token);
    } catch {
      // ignore
    }
  }
  const headers = new Headers();
  headers.set('Set-Cookie', clearSessionCookie());
  headers.set('Location', '/');
  return new NextResponse(null, { status: 302, headers });
}

export const GET = POST;

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const p of header.split(';')) {
    const [k, ...rest] = p.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}
