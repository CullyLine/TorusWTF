import { randomBytes } from 'node:crypto';

/**
 * CUID-style id generator. 24 chars, sortable by time prefix, collision-resistant.
 * Format: `<32-bit ms timestamp base36><10 bytes of randomness base36>`
 */
export function generateId(): string {
  const time = Date.now().toString(36).padStart(8, '0');
  const rand = randomBytes(8).toString('hex').slice(0, 16);
  return `${time}${rand}`;
}

/** Same shape but prefixed for readability in logs (`usr_abc...`, `clp_abc...`). */
export function generatePrefixedId(prefix: string): string {
  return `${prefix}_${generateId()}`;
}
