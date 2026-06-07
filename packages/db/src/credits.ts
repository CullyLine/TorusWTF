import { and, desc, eq } from 'drizzle-orm';
import { generatePrefixedId } from '@torus/shared';
import type { Db } from './client';
import { users, creditsLedger } from './schema';
import type { CreditsLedgerEntry } from './schema';

/**
 * Credit accounting engine. 1 credit = 1 US cent. The append-only
 * `credits_ledger` is the source of truth; `users.credit_balance` is a cache
 * kept in sync inside the same synchronous (better-sqlite3) transaction as
 * every write.
 *
 * Lives in @torus/db (not the web app) so both the web app and the background
 * worker can settle/refund against the same logic. All functions take a `Db`.
 *
 * Idempotency: non-adjustment entries carry (refType, refId), a UNIQUE index.
 * Replays return the original entry instead of double-applying.
 */

export const CREDITS_PER_DOLLAR = 100; // 1 credit = 1 cent

export class InsufficientCreditsError extends Error {
  readonly balance: number;
  readonly required: number;
  constructor(balance: number, required: number) {
    super(`Insufficient credits: have ${balance}, need ${required}.`);
    this.name = 'InsufficientCreditsError';
    this.balance = balance;
    this.required = required;
  }
}

type LedgerReason = CreditsLedgerEntry['reason'];

interface PostEntryInput {
  userId: string;
  delta: number;
  reason: LedgerReason;
  refType?: string | null;
  refId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function getBalance(db: Db, userId: string): number {
  const row = db
    .select({ balance: users.creditBalance })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return row?.balance ?? 0;
}

function findExisting(db: Db, refType: string, refId: string): CreditsLedgerEntry | undefined {
  return db
    .select()
    .from(creditsLedger)
    .where(and(eq(creditsLedger.refType, refType), eq(creditsLedger.refId, refId)))
    .get();
}

function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT';
}

function postEntry(db: Db, input: PostEntryInput): CreditsLedgerEntry {
  const { userId, delta, reason, refType = null, refId = null, metadata = null } = input;

  if (refType && refId) {
    const existing = findExisting(db, refType, refId);
    if (existing) return existing;
  }

  try {
    return db.transaction((tx) => {
      const u = tx
        .select({ balance: users.creditBalance })
        .from(users)
        .where(eq(users.id, userId))
        .get();
      if (!u) throw new Error(`Unknown user: ${userId}`);

      const balanceAfter = u.balance + delta;
      if (balanceAfter < 0) throw new InsufficientCreditsError(u.balance, -delta);

      const entry = tx
        .insert(creditsLedger)
        .values({
          id: generatePrefixedId('cl'),
          userId,
          delta,
          balanceAfter,
          reason,
          refType,
          refId,
          metadata: metadata ? JSON.stringify(metadata) : null,
        })
        .returning()
        .get();

      tx.update(users).set({ creditBalance: balanceAfter }).where(eq(users.id, userId)).run();
      return entry;
    });
  } catch (err) {
    if (refType && refId && isUniqueViolation(err)) {
      const existing = findExisting(db, refType, refId);
      if (existing) return existing;
    }
    throw err;
  }
}

export function topUp(
  db: Db,
  opts: { userId: string; credits: number; orderId: string; metadata?: Record<string, unknown> },
): CreditsLedgerEntry {
  if (opts.credits <= 0) throw new Error('Top-up credits must be positive.');
  return postEntry(db, {
    userId: opts.userId,
    delta: opts.credits,
    reason: 'topup',
    refType: 'polar_order',
    refId: opts.orderId,
    metadata: opts.metadata ?? null,
  });
}

export function reserveCredits(
  db: Db,
  opts: { userId: string; jobId: string; amount: number; metadata?: Record<string, unknown> },
): CreditsLedgerEntry {
  if (opts.amount <= 0) throw new Error('Reservation amount must be positive.');
  return postEntry(db, {
    userId: opts.userId,
    delta: -opts.amount,
    reason: 'job_reserve',
    refType: 'job_reserve',
    refId: opts.jobId,
    metadata: opts.metadata ?? null,
  });
}

export function refundJob(
  db: Db,
  opts: { userId: string; jobId: string; amount: number; metadata?: Record<string, unknown> },
): CreditsLedgerEntry {
  if (opts.amount <= 0) throw new Error('Refund amount must be positive.');
  return postEntry(db, {
    userId: opts.userId,
    delta: opts.amount,
    reason: 'job_refund',
    refType: 'job_refund',
    refId: opts.jobId,
    metadata: opts.metadata ?? null,
  });
}

export function adjustCredits(
  db: Db,
  opts: { userId: string; delta: number; metadata?: Record<string, unknown> },
): CreditsLedgerEntry {
  return postEntry(db, {
    userId: opts.userId,
    delta: opts.delta,
    reason: 'adjustment',
    metadata: opts.metadata ?? null,
  });
}

export function grantSignupBonus(db: Db, userId: string, amount: number): CreditsLedgerEntry | null {
  if (amount <= 0) return null;
  return postEntry(db, {
    userId,
    delta: amount,
    reason: 'signup_bonus',
    refType: 'signup_bonus',
    refId: userId,
  });
}

export function listLedger(db: Db, userId: string, limit = 50): CreditsLedgerEntry[] {
  return db
    .select()
    .from(creditsLedger)
    .where(eq(creditsLedger.userId, userId))
    .orderBy(desc(creditsLedger.createdAt))
    .limit(limit)
    .all();
}
