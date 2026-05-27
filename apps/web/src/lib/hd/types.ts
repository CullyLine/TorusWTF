/**
 * Home Depot internal tool — types.
 *
 * This module is fully isolated from the rest of torus.wtf. It backs the
 * hidden /hd order-puller page and nothing else.
 */

export const HD_STORE_ID = '3628';
export const HD_STORE_NAME = 'Hickory';

export interface HdItem {
  itemId: string;
  sku: string;
  brand: string | null;
  name: string;
  imageUrl: string | null;
  price: number | null;
  unitOfMeasure: string | null;
  /** null = "No Home" (item has no assigned shelf location). */
  aisle: string | null;
  /** null = "No Home" (item has no assigned shelf location). */
  bay: string | null;
  /** Store-specific quantity in stock at Hickory #3628. null = unknown. */
  quantity: number | null;
  canonicalUrl: string;
}

export interface HdSearchOk {
  ok: true;
  storeId: string;
  storeName: string;
  query: string;
  total: number;
  items: HdItem[];
}

export interface HdSearchErr {
  ok: false;
  storeId: string;
  storeName: string;
  query: string;
  error: string;
}

export type HdSearchResponse = HdSearchOk | HdSearchErr;
