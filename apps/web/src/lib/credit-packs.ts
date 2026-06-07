/**
 * Prepaid credit packs. 1 credit = 1 US cent, so credits map 1:1 to the price
 * (no markup — top-ups just buy credits; the margin lives in service pricing).
 *
 * Each pack maps to a Polar product. The Polar product id is read from an env
 * var so the same code works across self-hosted instances without hardcoding ids.
 */

export interface CreditPack {
  id: string;
  label: string;
  credits: number;
  priceUsd: number;
  /** Env var holding the Polar product id for this pack. */
  productIdEnv: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  {
    id: 'starter',
    label: 'Starter',
    credits: 500,
    priceUsd: 5,
    productIdEnv: 'POLAR_CREDITS_PRODUCT_STARTER',
  },
  {
    id: 'plus',
    label: 'Plus',
    credits: 2000,
    priceUsd: 20,
    productIdEnv: 'POLAR_CREDITS_PRODUCT_PLUS',
  },
  {
    id: 'pro',
    label: 'Pro',
    credits: 5000,
    priceUsd: 50,
    productIdEnv: 'POLAR_CREDITS_PRODUCT_PRO',
  },
];

export function getPack(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === id);
}

export function packProductId(pack: CreditPack): string | undefined {
  return process.env[pack.productIdEnv];
}

/** True if Polar is configured enough to sell at least one pack. */
export function creditsConfigured(): boolean {
  return Boolean(process.env.POLAR_API_KEY) && CREDIT_PACKS.some((p) => packProductId(p));
}
