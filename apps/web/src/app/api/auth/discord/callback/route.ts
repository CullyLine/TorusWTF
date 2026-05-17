import { Discord } from 'arctic';
import { NextResponse } from 'next/server';
import { buildSessionCookie, createSession, getOrCreateUserByDiscord } from '@/lib/auth';

interface DiscordUser {
  id: string;
  username: string;
  email: string | null;
  avatar: string | null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) {
    return redirectToError('Invalid Discord callback.');
  }

  const cookieHeader = req.headers.get('cookie') ?? '';
  const getCookie = (name: string) =>
    cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${name}=`))
      ?.split('=')[1] ?? null;

  const stateCookie = getCookie('torus_oauth_state');
  const verifierCookie = getCookie('torus_oauth_verifier');
  if (!stateCookie || decodeURIComponent(stateCookie) !== state) {
    return redirectToError('Sign-in state mismatch.');
  }
  if (!verifierCookie) {
    return redirectToError('Sign-in code verifier missing.');
  }
  const codeVerifier = decodeURIComponent(verifierCookie);

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const baseUrl = process.env.PUBLIC_URL ?? 'http://localhost:3000';
  if (!clientId || !clientSecret) {
    return redirectToError('Discord OAuth is not configured on this instance.');
  }
  const discord = new Discord(clientId, clientSecret, `${baseUrl}/api/auth/discord/callback`);

  let tokens;
  try {
    tokens = await discord.validateAuthorizationCode(code, codeVerifier);
  } catch {
    return redirectToError('Discord rejected the sign-in attempt.');
  }

  const res = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${tokens.accessToken()}` },
  });
  if (!res.ok) return redirectToError('Could not fetch Discord profile.');
  const profile = (await res.json()) as DiscordUser;

  const avatarUrl = profile.avatar
    ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
    : null;

  const user = await getOrCreateUserByDiscord({
    discordId: profile.id,
    username: profile.username,
    email: profile.email,
    avatarUrl,
  });

  const session = await createSession(user.id);

  const headers = new Headers();
  headers.append('Set-Cookie', buildSessionCookie(session.token, session.expiresAt));
  headers.append('Set-Cookie', 'torus_oauth_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
  headers.append('Set-Cookie', 'torus_oauth_verifier=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
  headers.set('Location', '/?welcome=1');
  return new NextResponse(null, { status: 302, headers });
}

function redirectToError(message: string): NextResponse {
  const url = new URL('/signin', process.env.PUBLIC_URL ?? 'http://localhost:3000');
  url.searchParams.set('error', message);
  return NextResponse.redirect(url, 302);
}
