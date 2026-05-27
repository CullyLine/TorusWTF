/**
 * Aisle/bay extraction.
 *
 * Home Depot's GraphQL responses don't put aisle/bay on a single fixed
 * field path — different products and different store layouts surface
 * them at slightly different nesting depths (sometimes on
 * `info.productSubType`, sometimes on a `location` object within
 * fulfillment). Rather than chase the schema, we walk the response
 * tree once and pull out any string that looks like an aisle or a bay.
 *
 * The fallback contract is explicit: if we can't find either field,
 * the item legitimately has "No Home". That is a real category at
 * the store (~2–5% of inventory) — it's not a missing-data placeholder.
 */

type Unknown = unknown;

const AISLE_KEYS = new Set([
  'aisle',
  'aisleNumber',
  'aisleNum',
  'aisle_number',
  'aisleId',
]);

const BAY_KEYS = new Set(['bay', 'bayNumber', 'bayNum', 'bay_number', 'bayId']);

const AISLE_BAY_KEYS = new Set([
  'aisleBay',
  'aisle_bay',
  'aisleAndBay',
  'location',
  'storeLocation',
]);

const STOP_KEYS = new Set([
  'images',
  'media',
  'reviews',
  'specifications',
  'specificationGroup',
  'taxonomy',
  'badges',
]);

function isPlainObject(v: Unknown): v is Record<string, Unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: Unknown): string | null {
  if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

function parseAisleBayString(s: string): { aisle: string | null; bay: string | null } {
  // Common formats seen in the wild: "Aisle 16, Bay 23", "16 / 023",
  // "A16-B23", "Aisle:16 Bay:23".
  const aisleMatch = s.match(/aisle\s*[:=#]?\s*([A-Z0-9-]+)/i);
  const bayMatch = s.match(/bay\s*[:=#]?\s*([A-Z0-9-]+)/i);
  if (aisleMatch || bayMatch) {
    return {
      aisle: aisleMatch?.[1] ?? null,
      bay: bayMatch?.[1] ?? null,
    };
  }
  const slash = s.match(/^([A-Z0-9-]+)\s*[/|-]\s*([A-Z0-9-]+)$/i);
  if (slash) return { aisle: slash[1] ?? null, bay: slash[2] ?? null };
  return { aisle: null, bay: null };
}

/**
 * Recursively walk an object/array looking for aisle and bay-like fields.
 * Returns the first non-empty pair found. Limits depth to keep us out of
 * any pathological cycles (Home Depot's responses don't cycle, but
 * belt-and-suspenders).
 */
export function extractAisleBay(
  root: Unknown,
  maxDepth = 8,
): { aisle: string | null; bay: string | null } {
  let foundAisle: string | null = null;
  let foundBay: string | null = null;

  function walk(node: Unknown, depth: number): void {
    if (depth > maxDepth) return;
    if (foundAisle && foundBay) return;

    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (!isPlainObject(node)) return;

    for (const [key, value] of Object.entries(node)) {
      if (foundAisle && foundBay) return;
      if (STOP_KEYS.has(key)) continue;

      if (AISLE_KEYS.has(key) && !foundAisle) {
        const s = asString(value);
        if (s) foundAisle = s;
        continue;
      }
      if (BAY_KEYS.has(key) && !foundBay) {
        const s = asString(value);
        if (s) foundBay = s;
        continue;
      }
      if (AISLE_BAY_KEYS.has(key)) {
        const s = asString(value);
        if (s) {
          const parsed = parseAisleBayString(s);
          if (parsed.aisle && !foundAisle) foundAisle = parsed.aisle;
          if (parsed.bay && !foundBay) foundBay = parsed.bay;
          if (foundAisle && foundBay) return;
        }
      }

      walk(value, depth + 1);
    }
  }

  walk(root, 0);
  return { aisle: foundAisle, bay: foundBay };
}
