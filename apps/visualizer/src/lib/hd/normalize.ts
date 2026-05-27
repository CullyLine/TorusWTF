/**
 * Map Home Depot's raw GraphQL responses into the flat `HdItem` shape
 * the /hd UI renders. Uses optional chaining everywhere so a schema
 * drift in any one field can't tank the whole search result.
 */

import { extractAisleBay } from './enrich';
import { HD_STORE_ID, type HdItem } from './types';

interface RawImage {
  url?: string | null;
  sizes?: string[] | null;
  type?: string | null;
  subType?: string | null;
}

interface RawLocation {
  isAnchor?: boolean | null;
  type?: string | null;
  storeName?: string | null;
  locationId?: string | null;
  inventory?: { quantity?: number | null; isInStock?: boolean | null } | null;
}

interface RawService {
  type?: string | null;
  locations?: RawLocation[] | null;
}

interface RawFulfillmentOption {
  type?: string | null;
  fulfillable?: boolean | null;
  services?: RawService[] | null;
}

interface RawProduct {
  itemId?: string | null;
  identifiers?: {
    storeSkuNumber?: string | null;
    productLabel?: string | null;
    brandName?: string | null;
    modelNumber?: string | null;
    canonicalUrl?: string | null;
  } | null;
  media?: { images?: RawImage[] | null } | null;
  pricing?: {
    value?: number | null;
    original?: number | null;
    unitOfMeasure?: string | null;
    alternatePriceDisplay?: boolean | null;
  } | null;
  fulfillment?: { fulfillmentOptions?: RawFulfillmentOption[] | null } | null;
}

interface RawSearchModel {
  searchModel?: {
    searchReport?: { totalProducts?: number | null } | null;
    products?: RawProduct[] | null;
  } | null;
}

function pickThumbnail(images: RawImage[] | null | undefined): string | null {
  if (!images?.length) return null;
  // Prefer the primary image. Home Depot returns templates like
  //   https://images.thdstatic.com/.../my-product-{size}.jpg
  // with `sizes` like ["65","100","145","300","400","600","1000"]
  // — we want a small one for the list view.
  const primary = images.find((i) => i?.subType === 'PRIMARY') ?? images[0];
  const url = primary?.url ?? null;
  if (!url) return null;
  if (url.includes('{size}')) {
    const target = primary?.sizes?.includes('145') ? '145' : (primary?.sizes?.[0] ?? '100');
    return url.replace('{size}', target);
  }
  return url;
}

function localQuantity(product: RawProduct, storeId: string): number | null {
  const options = product.fulfillment?.fulfillmentOptions ?? [];
  for (const opt of options) {
    // Pickup options surface BOPIS (in-store) inventory at the chosen store.
    if (opt?.type !== 'pickup') continue;
    for (const svc of opt.services ?? []) {
      // Some accounts call it "bopis", others "pickup" — accept both.
      const svcType = svc?.type?.toLowerCase() ?? '';
      if (!['bopis', 'pickup', 'pickupinstore'].includes(svcType)) continue;
      for (const loc of svc.locations ?? []) {
        const matchesStore =
          loc?.locationId === storeId || loc?.isAnchor === true || (svc.locations?.length ?? 0) === 1;
        if (matchesStore && typeof loc?.inventory?.quantity === 'number') {
          return loc.inventory.quantity;
        }
      }
    }
  }
  // Fallback: any in-store-style location with a quantity.
  for (const opt of options) {
    for (const svc of opt?.services ?? []) {
      for (const loc of svc?.locations ?? []) {
        if (loc?.type === 'store' && typeof loc.inventory?.quantity === 'number') {
          return loc.inventory.quantity;
        }
      }
    }
  }
  return null;
}

function canonicalUrl(product: RawProduct): string {
  const c = product.identifiers?.canonicalUrl;
  if (c) {
    return c.startsWith('http') ? c : `https://www.homedepot.com${c}`;
  }
  const id = product.itemId ?? '';
  return id ? `https://www.homedepot.com/p/${id}` : 'https://www.homedepot.com/';
}

export function normalizeSearch(data: RawSearchModel): {
  items: HdItem[];
  total: number;
} {
  const products = data.searchModel?.products ?? [];
  const total = data.searchModel?.searchReport?.totalProducts ?? products.length;

  const items: HdItem[] = products
    .filter((p): p is RawProduct => !!p?.itemId)
    .map((p) => {
      const initialLocation = extractAisleBay(p);
      return {
        itemId: p.itemId!,
        sku: p.identifiers?.storeSkuNumber ?? p.itemId!,
        brand: p.identifiers?.brandName ?? null,
        name: p.identifiers?.productLabel ?? '(no name)',
        imageUrl: pickThumbnail(p.media?.images),
        price: typeof p.pricing?.value === 'number' ? p.pricing.value : null,
        unitOfMeasure: p.pricing?.unitOfMeasure ?? null,
        aisle: initialLocation.aisle,
        bay: initialLocation.bay,
        quantity: localQuantity(p, HD_STORE_ID),
        canonicalUrl: canonicalUrl(p),
      };
    });

  return { items, total };
}

/**
 * Merge an aisle/bay pair discovered via the enrichment query back into
 * an existing item. Only overwrites if the item didn't already have
 * a value (i.e. extractAisleBay on the searchModel didn't find it).
 */
export function applyEnrichment(
  item: HdItem,
  found: { aisle: string | null; bay: string | null },
): HdItem {
  return {
    ...item,
    aisle: item.aisle ?? found.aisle,
    bay: item.bay ?? found.bay,
  };
}
