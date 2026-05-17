import 'server-only';
import { cookies } from 'next/headers';
import { eq, and, gt } from 'drizzle-orm';
import { sha256 } from '@oslojs/crypto/sha2';
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from '@oslojs/encoding';
import { generateId } from '@torus/shared';
import { db, users, sessions } from './db';
import type { User } from '@torus/db';

export const SESSION_COOKIE_NAME = 'torus_session';
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Generate a cryptographically random session token (returned to client, stored hashed). */
export function generateSessionToken(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return encodeBase32LowerCaseNoPadding(bytes);
}

function hashToken(token: string): string {
  return encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
}

export async function createSession(
  userId: string,
  token?: string,
): Promise<{ id: string; token: string; expiresAt: number }> {
  const t = token ?? generateSessionToken();
  const id = hashToken(t);
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  await db.insert(sessions).values({ id, userId, expiresAt });
  return { id, token: t, expiresAt };
}

export async function validateSessionToken(token: string): Promise<User | null> {
  const id = hashToken(token);
  const now = Date.now();
  const rows = await db
    .select({ user: users, session: sessions })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  // Sliding expiration: refresh if more than half consumed
  if (row.session.expiresAt - now < SESSION_DURATION_MS / 2) {
    await db
      .update(sessions)
      .set({ expiresAt: now + SESSION_DURATION_MS })
      .where(eq(sessions.id, id));
  }
  return row.user;
}

export async function invalidateSession(token: string): Promise<void> {
  const id = hashToken(token);
  await db.delete(sessions).where(eq(sessions.id, id));
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const p of header.split(';')) {
    const [k, ...rest] = p.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/** Returns the authenticated user from the incoming Request, or null. */
export async function getCurrentUser(req: Request): Promise<User | null> {
  const token = readCookie(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  return validateSessionToken(token);
}

/** Same, but for Server Components — uses next/headers cookies() instead of a Request. */
export async function getCurrentUserFromCookies(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return validateSessionToken(token);
}

export function buildSessionCookie(token: string, expiresAt: number): string {
  const secure = (process.env.PUBLIC_URL ?? '').startsWith('https://');
  const attrs = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ].filter(Boolean);
  return attrs.join('; ');
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// ---------- Handle picker for new accounts ----------

const HANDLE_RE = /^[a-z0-9_-]{3,32}$/;

export function isValidHandle(handle: string): boolean {
  return HANDLE_RE.test(handle.toLowerCase());
}

export async function generateAvailableHandle(seed: string): Promise<string> {
  const base =
    seed
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 16) || 'torus';
  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? base : `${base}${i + 1}`;
    if (!isValidHandle(candidate)) continue;
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.handle, candidate))
      .limit(1);
    if (existing.length === 0) return candidate;
  }
  return `${base}-${generateId().slice(-6)}`;
}

export async function getOrCreateUserByEmail(email: string): Promise<User> {
  const lower = email.toLowerCase().trim();
  const existing = await db.select().from(users).where(eq(users.email, lower)).limit(1);
  if (existing[0]) return existing[0];

  const handle = await generateAvailableHandle(lower.split('@')[0] ?? 'torus');
  const id = generateId();
  await db.insert(users).values({ id, handle, email: lower });
  const created = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return created[0]!;
}

export async function getOrCreateUserByDiscord(opts: {
  discordId: string;
  username: string;
  email: string | null;
  avatarUrl: string | null;
}): Promise<User> {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.discordId, opts.discordId))
    .limit(1);
  if (existing[0]) return existing[0];

  // If they share an email with an existing account, link instead of creating a duplicate
  if (opts.email) {
    const byEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, opts.email.toLowerCase()))
      .limit(1);
    if (byEmail[0]) {
      await db
        .update(users)
        .set({ discordId: opts.discordId, avatarUrl: byEmail[0].avatarUrl ?? opts.avatarUrl })
        .where(eq(users.id, byEmail[0].id));
      return { ...byEmail[0], discordId: opts.discordId };
    }
  }

  const handle = await generateAvailableHandle(opts.username);
  const id = generateId();
  await db.insert(users).values({
    id,
    handle,
    email: opts.email?.toLowerCase() ?? null,
    discordId: opts.discordId,
    avatarUrl: opts.avatarUrl,
  });
  const created = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return created[0]!;
}
