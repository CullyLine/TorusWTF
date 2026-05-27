'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { HdItem, HdSearchResponse } from '@/lib/hd/types';

/**
 * Mobile-first stock lookup for Home Depot Hickory (#3628).
 *
 * Hard-isolated from the rest of torus.wtf — no shared components, no
 * shared state, no shared styling. Renders inside a fixed full-viewport
 * .hd-root layer so the dark torus body styling never bleeds through.
 */

interface FetchState {
  query: string;
  loading: boolean;
  items: HdItem[];
  total: number;
  storeName: string;
  storeId: string;
  error: string | null;
}

const INITIAL: FetchState = {
  query: '',
  loading: false,
  items: [],
  total: 0,
  storeName: 'Hickory',
  storeId: '3628',
  error: null,
};

const formatCurrency = (n: number | null) =>
  typeof n === 'number'
    ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    : '—';

const formatUom = (u: string | null) => {
  if (!u) return '';
  const trimmed = u.toLowerCase().trim();
  if (trimmed === 'each' || trimmed === 'ea') return 'ea';
  return u;
};

export default function HdPage() {
  const [input, setInput] = useState('');
  const [state, setState] = useState<FetchState>(INITIAL);
  const inflightRef = useRef<AbortController | null>(null);

  const debouncedQuery = useDebounced(input.trim(), 350);

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      inflightRef.current?.abort();
      setState((s) => ({ ...s, query: debouncedQuery, loading: false, items: [], total: 0, error: null }));
      return;
    }

    inflightRef.current?.abort();
    const controller = new AbortController();
    inflightRef.current = controller;

    setState((s) => ({ ...s, query: debouncedQuery, loading: true, error: null }));

    fetch(`/api/hd/search?q=${encodeURIComponent(debouncedQuery)}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as Partial<HdSearchResponse>;
        if (body && 'ok' in body && body.ok === true) {
          setState({
            query: debouncedQuery,
            loading: false,
            items: body.items ?? [],
            total: body.total ?? 0,
            storeId: body.storeId ?? '3628',
            storeName: body.storeName ?? 'Hickory',
            error: null,
          });
          return;
        }
        const message =
          body && 'error' in body && typeof body.error === 'string'
            ? body.error
            : `HTTP ${r.status}`;
        setState((s) => ({
          ...s,
          loading: false,
          items: [],
          total: 0,
          error: message,
        }));
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : 'Network error',
        }));
      });

    return () => controller.abort();
  }, [debouncedQuery]);

  return (
    <main className="hd-root">
      <div className="mx-auto flex w-full max-w-2xl flex-col">
        <Header storeName={state.storeName} storeId={state.storeId} />

        <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80">
          <SearchInput value={input} onChange={setInput} />
          <StatusLine
            query={state.query}
            loading={state.loading}
            total={state.total}
            shown={state.items.length}
            error={state.error}
          />
        </div>

        <Results state={state} input={input} />

        <footer className="px-3 py-6 text-center text-xs text-zinc-400">
          Hickory #3628 · internal use only
        </footer>
      </div>
    </main>
  );
}

function Header({ storeName, storeId }: { storeName: string; storeId: string }) {
  return (
    <header className="px-3 pb-1 pt-4">
      <div className="flex items-baseline gap-2">
        <h1 className="text-lg font-semibold tracking-tight text-zinc-900">HD</h1>
        <span className="text-sm text-zinc-500">
          {storeName} <span className="text-zinc-400">#{storeId}</span>
        </span>
      </div>
    </header>
  );
}

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <input
        type="search"
        inputMode="search"
        autoFocus
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="search"
        placeholder="Search in-stock at Hickory…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 pr-10 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-zinc-400 active:bg-zinc-100"
        >
          ×
        </button>
      )}
    </div>
  );
}

function StatusLine({
  query,
  loading,
  total,
  shown,
  error,
}: {
  query: string;
  loading: boolean;
  total: number;
  shown: number;
  error: string | null;
}) {
  if (error) {
    return (
      <p className="mt-2 text-xs text-rose-700">
        Couldn’t reach Home Depot ({error.slice(0, 120)}). Try again.
      </p>
    );
  }
  if (loading) {
    return <p className="mt-2 text-xs text-zinc-500">Searching…</p>;
  }
  if (!query || query.length < 2) {
    return <p className="mt-2 text-xs text-zinc-400">type at least 2 letters</p>;
  }
  if (shown === 0) {
    return <p className="mt-2 text-xs text-zinc-500">nothing in stock today matches</p>;
  }
  return (
    <p className="mt-2 text-xs text-zinc-500">
      {shown} of {total.toLocaleString()} shown
    </p>
  );
}

function Results({ state, input }: { state: FetchState; input: string }) {
  if (!input.trim() || input.trim().length < 2) {
    return <EmptyHint />;
  }
  if (state.items.length === 0) {
    return null;
  }
  return (
    <ul className="flex flex-col divide-y divide-zinc-200 px-0 pb-4">
      {state.items.map((item) => (
        <ItemRow key={item.itemId} item={item} />
      ))}
    </ul>
  );
}

function EmptyHint() {
  return (
    <div className="px-4 pt-10 text-center text-sm text-zinc-400">
      <p>Search for any item.</p>
      <p className="mt-1 text-xs">
        Results auto-filtered to in-stock at Hickory.
      </p>
    </div>
  );
}

function ItemRow({ item }: { item: HdItem }) {
  const aisle = item.aisle?.trim();
  const bay = item.bay?.trim();
  const hasLocation = Boolean(aisle && bay);

  const priceLine = useMemo(() => {
    const price = formatCurrency(item.price);
    const uom = formatUom(item.unitOfMeasure);
    return uom ? `${price} / ${uom}` : price;
  }, [item.price, item.unitOfMeasure]);

  return (
    <li className="flex gap-3 bg-white px-3 py-3 active:bg-zinc-50">
      <div className="shrink-0">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            width={72}
            height={72}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-[72px] w-[72px] rounded-md border border-zinc-200 bg-white object-contain"
          />
        ) : (
          <div className="grid h-[72px] w-[72px] place-items-center rounded-md border border-zinc-200 bg-zinc-50 text-xs text-zinc-400">
            no img
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <a
          href={item.canonicalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hd-line-clamp-2 text-sm font-medium text-zinc-900"
        >
          {item.name}
        </a>

        <div className="mt-0.5 truncate text-xs text-zinc-500">
          {item.brand ? <>{item.brand} · </> : null}
          <span className="font-mono">{item.sku}</span>
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-zinc-900">{priceLine}</span>
          <LocationTag
            aisle={hasLocation ? aisle ?? null : null}
            bay={hasLocation ? bay ?? null : null}
          />
        </div>

        <div className="mt-1 text-xs text-zinc-600">
          {typeof item.quantity === 'number'
            ? `${item.quantity.toLocaleString()} in stock`
            : 'qty unknown'}
        </div>
      </div>
    </li>
  );
}

function LocationTag({ aisle, bay }: { aisle: string | null; bay: string | null }) {
  if (!aisle || !bay) {
    return (
      <span className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-amber-800 ring-1 ring-amber-200">
        No Home
      </span>
    );
  }
  return (
    <span className="rounded-md bg-orange-50 px-2 py-1 text-xs font-semibold tabular-nums text-orange-700 ring-1 ring-orange-200">
      Aisle {aisle} · Bay {bay}
    </span>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
