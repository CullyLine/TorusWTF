import { randomBytes } from 'node:crypto';

// Crockford base32 alphabet — excludes I, L, O, U to avoid ambiguity
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ALPHABET_LEN = ALPHABET.length;
const CODE_LEN = 8;

/**
 * Generates a fresh 8-character share code from cryptographically random bytes.
 * ~32^8 = 1.09 trillion codes. Collision-safe for the foreseeable future.
 * Callers should still loop with isUnique() to handle the astronomically rare hit.
 */
export function generateShareCode(): string {
  const bytes = randomBytes(CODE_LEN);
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET_LEN];
  }
  return out;
}

/**
 * Convenience: keep generating until isUnique(code) returns true.
 * Bound by maxAttempts so it never runs forever in a degenerate case.
 */
export async function generateUniqueShareCode(
  isUnique: (code: string) => Promise<boolean>,
  maxAttempts = 8,
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateShareCode();
    if (await isUnique(code)) return code;
  }
  throw new Error(
    `Failed to generate a unique share code after ${maxAttempts} attempts — share-code space may be saturated.`,
  );
}

const VALID_CODE_RE = new RegExp(`^[${ALPHABET}]{${CODE_LEN}}$`);

export function isValidShareCode(code: string): boolean {
  return VALID_CODE_RE.test(code.toUpperCase());
}

export function normalizeShareCode(code: string): string {
  return code.toUpperCase();
}
