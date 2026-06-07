import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getBalance, listLedger } from '@/lib/credits';

/** GET /api/credits — current balance + recent ledger entries. */
export async function GET(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  const balance = getBalance(user.id);
  const ledger = listLedger(user.id, 25).map((e) => ({
    id: e.id,
    delta: e.delta,
    balanceAfter: e.balanceAfter,
    reason: e.reason,
    createdAt: e.createdAt,
  }));
  return NextResponse.json({ balance, ledger });
}
