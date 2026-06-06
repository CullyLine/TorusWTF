import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db, users, creditsLedger } from '@/lib/db';
import { generatePrefixedId } from '@torus/shared';
import type { CreditsLedgerEntry } from '@torus/db';

/**
 * Credit accounting. 1 credit = 1 US cent. The append-only `credits_ledger` is
 * the source of truth; `users.credit_balance` is a denormalized cache kept in
 * sync inside the same synchronous (better-sqlite3) transaction as every write.
 *
 * Money model for jobs (flat-price, reserve-then-keep):
 *   - reserveCredits()  debits the cost up front (prevents double-spend).
 *   - on success        the reservation simply stands; mark the job settled.
 *   - refundJob()       credits the cost back if the job fails.
 *
 * Idempotency: every non-adjustment entry carries (refType, refId), which is a
 * UNIQUE index. Replays (webhook retries, double-clicks) are no-ops that return
 * the original entry instead of applying twice.
 */

export const CREDITS_PER_DOLLAR = 100; // 1 credit = 1 cent
export const SIGNUP_BONUS_CREDITS = 0; // set >0 to give new users a starter balance

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
  /** Positive = add, negative = spend. */
  delta: number;
  reason: LedgerReason;
  refType?: string | null;
  refId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** O(1) balance read from the cache column. Returns 0 if the user is unknown. */
export function getBalance(userId: string): number {
  const row = db
    .select({ balance: users.creditBalance })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return row?.balance ?? 0;
}

function findExistingEntry(refType: string, refId: string): CreditsLedgerEntry | undefined {
  return db
    .select()
    .from(creditsLedger)
    .where(and(eq(creditsLedger.refType, refType), eq(creditsLedger.refId, refId)))
    .get();
}

/**
 * Apply one ledger entry + balance update atomically. Throws
 * InsufficientCreditsError if a debit would drive the balance negative.
 * When (refType, refId) is provided the call is idempotent.
 */
function postEntry(input: PostEntryInput): CreditsLedgerEntry {
  const { userId, delta, reason, refType = null, refId = null, metadata = null } = input;

  if (refType && refId) {
    const existing = findExistingEntry(refType, refId);
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

      const id = generatePrefixedId('cl');
      const entry = tx
        .insert(creditsLedger)
        .values({
          id,
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
    // Lost an idempotency race: another writer inserted the same (refType,refId).
    if (refType && refId && isUniqueViolation(err)) {
      const existing = findExistingEntry(refType, refId);
      if (existing) return existing;
    }
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT';
}

/** Add credits from a paid top-up. Idempotent on the payment order id. */
export function topUp(opts: {
  userId: string;
  credits: number;
  orderId: string;
  metadata?: Record<string, unknown>;
}): CreditsLedgerEntry {
  if (opts.credits <= 0) throw new Error('Top-up credits must be positive.');
  return postEntry({
    userId: opts.userId,
    delta: opts.credits,
    reason: 'topup',
    refType: 'polar_order',
    refId: opts.orderId,
    metadata: opts.metadata ?? null,
  });
}

/** Reserve (debit) credits for a job. Throws InsufficientCreditsError. */
export function reserveCredits(opts: {
  userId: string;
  jobId: string;
  amount: number;
  metadata?: Record<string, unknown>;
}): CreditsLedgerEntry {
  if (opts.amount <= 0) throw new Error('Reservation amount must be positive.');
  return postEntry({
    userId: opts.userId,
    delta: -opts.amount,
    reason: 'job_reserve',
    refType: 'job_reserve',
    refId: opts.jobId,
    metadata: opts.metadata ?? null,
  });
}

/** Refund a previously reserved job cost. Idempotent per job. */
export function refundJob(opts: {
  userId: string;
  jobId: string;
  amount: number;
  metadata?: Record<string, unknown>;
}): CreditsLedgerEntry {
  if (opts.amount <= 0) throw new Error('Refund amount must be positive.');
  return postEntry({
    userId: opts.userId,
    delta: opts.amount,
    reason: 'job_refund',
    refType: 'job_refund',
    refId: opts.jobId,
    metadata: opts.metadata ?? null,
  });
}

/** Manual admin adjustment (no idempotency key). */
export function adjustCredits(opts: {
  userId: string;
  delta: number;
  metadata?: Record<string, unknown>;
}): CreditsLedgerEntry {
  return postEntry({
    userId: opts.userId,
    delta: opts.delta,
    reason: 'adjustment',
    metadata: opts.metadata ?? null,
  });
}

/** One-time signup bonus, idempotent per user. No-op when bonus is 0. */
export function grantSignupBonus(userId: string): CreditsLedgerEntry | null {
  if (SIGNUP_BONUS_CREDITS <= 0) return null;
  return postEntry({
    userId,
    delta: SIGNUP_BONUS_CREDITS,
    reason: 'signup_bonus',
    refType: 'signup_bonus',
    refId: userId,
  });
}

/** Recent ledger entries for a user, newest first. */
export function listLedger(userId: string, limit = 50): CreditsLedgerEntry[] {
  return db
    .select()
    .from(creditsLedger)
    .where(eq(creditsLedger.userId, userId))
    .orderBy(desc(creditsLedger.createdAt))
    .limit(limit)
    .all();
}
