import type { User } from '@torus/db';

/** One-time Production License — account-bound, site-wide perks. */
export const LICENSE_PRICE_USD = 10;

export const LICENSE_BENEFITS = [
  'Highest-quality 1440p exports',
  '60 fps and 144 fps exports',
  'No torus.wtf watermark on exports',
  'Commercial-use permission for your exports',
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
