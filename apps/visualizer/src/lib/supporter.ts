import type { User } from '@torus/db';

/**
 * torus sold a one-time Production License before it became free. Accounts
 * that bought one keep a thank-you badge on their profile.
 */
export function isEarlySupporter(
  user: Pick<User, 'productionLicenseAt'> | null | undefined,
): boolean {
  return Boolean(user?.productionLicenseAt);
}
