import { describe, expect, it } from 'vitest';
import { formatClock } from './time';

describe('formatClock', () => {
  it('formats seconds as minutes and zero-padded seconds', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(9)).toBe('0:09');
    expect(formatClock(75)).toBe('1:15');
    expect(formatClock(600)).toBe('10:00');
  });

  it('drops fractions instead of rounding up', () => {
    expect(formatClock(59.9)).toBe('0:59');
  });

  it('shows zero for values a media element reports before it has a duration', () => {
    expect(formatClock(Number.NaN)).toBe('0:00');
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe('0:00');
    expect(formatClock(-3)).toBe('0:00');
  });
});
