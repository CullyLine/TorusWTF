/**
 * Returns the ISO 8601 week bucket string for the given date (UTC).
 * Format: "YYYY-Www" — e.g. "2026-W20".
 *
 * Vote eligibility resets on Monday 00:00 UTC, which is exactly the ISO week boundary.
 */
export function isoWeekBucket(date: Date = new Date()): string {
  // Algorithm from https://en.wikipedia.org/wiki/ISO_week_date#Calculating_the_week_number_from_an_ordinal_date
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/** Parses "YYYY-Www" into [year, week]. */
export function parseWeekBucket(bucket: string): { year: number; week: number } | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(bucket);
  if (!m) return null;
  return { year: Number(m[1]), week: Number(m[2]) };
}

/** Returns the previous ISO week bucket. */
export function previousWeekBucket(bucket: string = isoWeekBucket()): string {
  const parsed = parseWeekBucket(bucket);
  if (!parsed) throw new Error(`Invalid week bucket: ${bucket}`);
  // Jan 4 is always in week 1
  const jan4 = new Date(Date.UTC(parsed.year, 0, 4));
  const firstMon = new Date(jan4);
  firstMon.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  const thisMon = new Date(firstMon);
  thisMon.setUTCDate(firstMon.getUTCDate() + (parsed.week - 1) * 7);
  thisMon.setUTCDate(thisMon.getUTCDate() - 7);
  return isoWeekBucket(thisMon);
}
