import { randomBytes } from 'node:crypto';

/**
 * Generates a 24-character id that sorts by creation time.
 * Format: 8 base36 characters of millisecond timestamp, then 16 random hex characters.
 */
export function generateId(): string {
  const time = Date.now().toString(36).padStart(8, '0');
  const rand = randomBytes(8).toString('hex').slice(0, 16);
  return `${time}${rand}`;
}
