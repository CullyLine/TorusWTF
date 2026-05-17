import { describe, expect, it } from 'vitest';
import {
  generateShareCode,
  generateUniqueShareCode,
  isValidShareCode,
  normalizeShareCode,
} from './share-code';
import { isoWeekBucket, parseWeekBucket, previousWeekBucket } from './week';

describe('share-code', () => {
  it('generates 8-character codes from the allowed alphabet', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateShareCode();
      expect(code).toHaveLength(8);
      expect(isValidShareCode(code)).toBe(true);
    }
  });

  it('normalizes lowercase to uppercase', () => {
    expect(normalizeShareCode('kt9mfq2x')).toBe('KT9MFQ2X');
  });

  it('rejects ambiguous letters (I, L, O, U)', () => {
    expect(isValidShareCode('KT9MIO2X')).toBe(false);
    expect(isValidShareCode('KT9MLO2X')).toBe(false);
    expect(isValidShareCode('KT9MUO2X')).toBe(false);
  });

  it('rejects wrong-length codes', () => {
    expect(isValidShareCode('KT9MFQ2')).toBe(false);
    expect(isValidShareCode('KT9MFQ2XX')).toBe(false);
    expect(isValidShareCode('')).toBe(false);
  });

  it('retries until a unique code is found', async () => {
    let calls = 0;
    const code = await generateUniqueShareCode(async () => {
      calls++;
      return calls > 3;
    });
    expect(isValidShareCode(code)).toBe(true);
    expect(calls).toBe(4);
  });
});

describe('week bucket', () => {
  it('returns ISO week buckets in YYYY-Www format', () => {
    const bucket = isoWeekBucket(new Date('2026-05-17T00:00:00Z'));
    expect(bucket).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('parses week buckets back out', () => {
    const parsed = parseWeekBucket('2026-W20');
    expect(parsed).toEqual({ year: 2026, week: 20 });
  });

  it('previous week wraps year boundaries', () => {
    const prev = previousWeekBucket('2026-W01');
    expect(prev).toMatch(/^2025-W\d{2}$/);
  });
});
