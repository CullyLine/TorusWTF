import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

/** GET /api/auth/me — current session user for client UI (upload dialog, etc.). */
export async function GET(req: Request) {
  const discordAuth = Boolean(
    process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET,
  );
  const user = await getCurrentUser(req).catch(() => null);
  if (!user) {
    return NextResponse.json({ user: null, discordAuth });
  }
  return NextResponse.json({
    user: {
      id: user.id,
      handle: user.handle,
    },
    discordAuth,
  });
}
