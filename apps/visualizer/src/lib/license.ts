import type { User } from '@torus/db';

/** One-time Production License — account-bound, site-wide perks. */
export const LICENSE_PRICE_USD = 10;

/**
 * Single source of truth for licensed-tier marketing copy. The actual gates
 * live in `lib/export-config.ts` (free = 720p / 30 fps; licensed = every
 * resolution and frame rate, up to 4K / 240 fps).
 */
export const LICENSE_BENEFITS = [
  'Exports up to 4K resolution',
  'High frame-rate exports (60 / 120 / 240 fps)',
  'Remove the watermark — or replace it with your own custom logo',
  'Commercial-use permission for your exports',
  'Custom palette colors and title-card styling',
  'A licensed badge on your profile',
] as const;

type LicenseFields = Pick<User, 'productionLicenseAt'>;

/** True when the account holds a one-time Production License. */
export function hasLicense(user: LicenseFields | null | undefined): boolean {
  return Boolean(user && user.productionLicenseAt);
}

/** Whether Polar is wired up for license checkout on this instance. */
export function licenseConfigured(): boolean {
  return Boolean(process.env.POLAR_API_KEY && process.env.POLAR_PRODUCTION_LICENSE_PRODUCT_ID);
}

export function licenseProductId(): string | undefined {
  return process.env.POLAR_PRODUCTION_LICENSE_PRODUCT_ID;
}
