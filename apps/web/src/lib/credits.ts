import 'server-only';
import { db } from '@/lib/db';
import * as engine from '@torus/db';

/**
 * Web-side credit helpers — thin bindings over the shared @torus/db engine,
 * pre-wired to the app's singleton db. The worker uses the same engine with its
 * own db instance, so settle/refund logic is identical across processes.
 */

export { CREDITS_PER_DOLLAR, InsufficientCreditsError } from '@torus/db';

/** Credits granted to brand-new accounts. Set >0 to enable a starter balance. */
export const SIGNUP_BONUS_CREDITS = 0;

export const getBalance = (userId: string) => engine.getBalance(db, userId);

export const topUp = (opts: {
  userId: string;
  credits: number;
  orderId: string;
  metadata?: Record<string, unknown>;
}) => engine.topUp(db, opts);

export const reserveCredits = (opts: {
  userId: string;
  jobId: string;
  amount: number;
  metadata?: Record<string, unknown>;
}) => engine.reserveCredits(db, opts);

export const refundJob = (opts: {
  userId: string;
  jobId: string;
  amount: number;
  metadata?: Record<string, unknown>;
}) => engine.refundJob(db, opts);

export const adjustCredits = (opts: {
  userId: string;
  delta: number;
  metadata?: Record<string, unknown>;
}) => engine.adjustCredits(db, opts);

export const grantSignupBonus = (userId: string) =>
  engine.grantSignupBonus(db, userId, SIGNUP_BONUS_CREDITS);

export const listLedger = (userId: string, limit = 50) => engine.listLedger(db, userId, limit);
