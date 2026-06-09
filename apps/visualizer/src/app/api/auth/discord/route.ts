import { Discord, generateState, generateCodeVerifier } from 'arctic';
import { NextResponse } from 'next/server';

function safeNextPath(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

export async function GET(req: Request) {
  const reqUrl = new URL(req.url);
  const popup = reqUrl.searchParams.get('popup') === '1';
  const next = safeNextPath(reqUrl.searchParams.get('next'));
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const baseUrl = (process.env.PUBLIC_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Discord OAuth is not configured on this instance.' },
      { status: 501 },
    );
  }
  const discord = new Discord(clientId, clientSecret, `${baseUrl}/api/auth/discord/callback`);
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const authUrl = discord.createAuthorizationURL(state, codeVerifier, ['identify', 'email']);

  const headers = new Headers();
  const secure = baseUrl.startsWith('https://');
  const cookieAttrs = `Path=/; Max-Age=600; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
  headers.append('Set-Cookie', `torus_oauth_state=${encodeURIComponent(state)}; ${cookieAttrs}`);
  headers.append(
    'Set-Cookie',
    `torus_oauth_verifier=${encodeURIComponent(codeVerifier)}; ${cookieAttrs}`,
  );
  if (popup) {
    headers.append('Set-Cookie', `torus_oauth_popup=1; ${cookieAttrs}`);
  }
  if (next) {
    headers.append('Set-Cookie', `torus_oauth_next=${encodeURIComponent(next)}; ${cookieAttrs}`);
  }
  headers.set('Location', authUrl.toString());
  return new NextResponse(null, { status: 302, headers });
}
