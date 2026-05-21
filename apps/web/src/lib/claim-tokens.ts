export const CLAIM_TOKENS_STORAGE_KEY = 'torus_claim_tokens';
export const CLAIM_TOKEN_HEADER = 'x-claim-token';

export interface StoredClaimToken {
  token: string;
  shareCode: string;
  at: number;
}

export function getClaimTokenForShareCode(shareCode: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const code = shareCode.toUpperCase();
    const items = JSON.parse(
      localStorage.getItem(CLAIM_TOKENS_STORAGE_KEY) || '[]',
    ) as StoredClaimToken[];
    const match = items.find((x) => x.shareCode.toUpperCase() === code);
    return match?.token ?? null;
  } catch {
    return null;
  }
}

export function clipManageHeaders(shareCode: string): HeadersInit {
  const claimToken = getClaimTokenForShareCode(shareCode);
  if (!claimToken) return {};
  return { [CLAIM_TOKEN_HEADER]: claimToken };
}

export function addClaimToken(opts: { shareCode: string; token: string }): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const code = opts.shareCode.toUpperCase();
    const items = JSON.parse(
      localStorage.getItem(CLAIM_TOKENS_STORAGE_KEY) || '[]',
    ) as StoredClaimToken[];
    const filtered = items.filter((x) => x.shareCode.toUpperCase() !== code);
    filtered.push({ token: opts.token, shareCode: code, at: Date.now() });
    localStorage.setItem(CLAIM_TOKENS_STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    // ignore
  }
}

export function getAllStoredClaimTokens(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const items = JSON.parse(
      localStorage.getItem(CLAIM_TOKENS_STORAGE_KEY) || '[]',
    ) as StoredClaimToken[];
    return items.map((x) => x.token).filter(Boolean);
  } catch {
    return [];
  }
}

export function removeClaimTokenForShareCode(shareCode: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const items = JSON.parse(
      localStorage.getItem(CLAIM_TOKENS_STORAGE_KEY) || '[]',
    ) as StoredClaimToken[];
    const next = items.filter((x) => x.shareCode !== shareCode);
    localStorage.setItem(CLAIM_TOKENS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}
