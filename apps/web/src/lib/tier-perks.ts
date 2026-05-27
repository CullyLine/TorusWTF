import type { UserTier } from '@torus/shared';

/**
 * Single registry of Supporter perks. Adding a new perk later is one entry here
 * + a `hasPerk()` check at the read site. No core feature ever ends up gated;
 * see PRINCIPLES.md.
 */
export const PERKS = {
  custom_subdomain: {
    id: 'custom_subdomain',
    label: 'Custom subdomain',
    description: 'Use yourname.torus.wtf as your profile page.',
    requires: 'supporter' as UserTier,
  },
  // Add new perks here. v1 ships with just one — intentionally.
} as const;

export type PerkId = keyof typeof PERKS;

export function hasPerk(tier: UserTier | null | undefined, perkId: PerkId): boolean {
  if (!tier) return false;
  const perk = PERKS[perkId];
  return perkRanks[tier] >= perkRanks[perk.requires];
}

const perkRanks: Record<UserTier, number> = { free: 0, supporter: 1 };
