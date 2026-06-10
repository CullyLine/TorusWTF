import 'server-only';

import { eq } from 'drizzle-orm';
import type { User } from '@torus/db';
import { db, users } from './db';
import { hasLicense } from './license';

export type PolarMetadataCarrier = {
  id?: string;
  metadata?: Record<string, unknown> | null;
  checkout?: { metadata?: Record<string, unknown> | null; id?: string } | null;
  customer?: { email?: string | null; metadata?: Record<string, unknown> | null } | null;
  customer_metadata?: Record<string, unknown> | null;
};

/** Pull the torus account id Polar echoed from checkout metadata. */
export function extractPolarUserId(data: PolarMetadataCarrier | null | undefined): string | null {
  if (!data) return null;
  const buckets = [
    data.metadata,
    data.checkout?.metadata,
    data.customer?.metadata,
    data.customer_metadata,
  ];
  for (const m of buckets) {
    if (!m) continue;
    const id = m.userId ?? m.user_id;
    if (typeof id === 'string' && id.length > 0) return id;
  }
  return null;
}

export async function resolveLicenseUser(
  data: PolarMetadataCarrier,
  fallbackEmail?: string | null,
): Promise<{ id: string } | undefined> {
  const userId = extractPolarUserId(data);
  if (userId) {
    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
    if (target) return target;
  }

  const email =
    (typeof fallbackEmail === 'string' && fallbackEmail.length > 0
      ? fallbackEmail.toLowerCase()
      : null) ??
    (typeof data.customer?.email === 'string' ? data.customer.email.toLowerCase() : null);

  if (email) {
    const [target] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (target) return target;
  }

  return undefined;
}

export async function grantProductionLicense(userId: string, orderId: string | null): Promise<void> {
  await db
    .update(users)
    .set({ productionLicenseAt: Date.now(), productionLicenseOrderId: orderId })
    .where(eq(users.id, userId));
}

/** Idempotent: returns true when the account already holds or was just granted a license. */
export async function ensureAccountLicensed(
  user: Pick<User, 'id' | 'email' | 'productionLicenseAt'>,
  orderId: string | null,
): Promise<boolean> {
  if (hasLicense(user)) return true;
  await grantProductionLicense(user.id, orderId);
  return true;
}
