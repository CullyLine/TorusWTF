'use client';

import { Button, cx, inputClass } from '@/components/ui/controls';
import { CloseIcon } from '@/components/ui/icons';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { DEFAULT_SOUNDFONT_ID, type PresetInfo, type SoundfontInfo } from '@/lib/conductor/engine';
import type { PresetRef } from '@/lib/conductor/project';

interface InstrumentPickerProps {
  presets: PresetInfo[];
  soundfonts: SoundfontInfo[];
  loading: boolean;
  title?: string;
  onPick: (preset: PresetRef) => void;
  onClose: () => void;
  onUploadSoundfont: (file: File) => Promise<void> | void;
}

function presetToRef(p: PresetInfo): PresetRef {
  return {
    soundfontId: DEFAULT_SOUNDFONT_ID,
    name: p.name,
    bankMSB: p.bankMSB,
    bankLSB: p.bankLSB,
    program: p.program,
  };
}

export function InstrumentPicker({
  presets,
  soundfonts,
  loading,
  title = 'Choose an instrument',
  onPick,
  onClose,
  onUploadSoundfont,
}: InstrumentPickerProps) {
  const [query, setQuery] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return presets;
    return presets.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        `${p.bankMSB}:${p.program}`.includes(q) ||
        String(p.program).includes(q),
    );
  }, [presets, query]);

  useEffect(() => {
    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = panelRef.current?.querySelector<HTMLElement>(
      'button, [href], input, [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const firstEl = focusable[0]!;
        const lastEl = focusable[focusable.length - 1]!;
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previousFocus.current?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-md border border-torus-border-strong bg-torus-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-torus-border px-4 py-3">
          <span id={titleId} className="text-sm font-semibold">
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-torus-fg-dim hover:bg-torus-raised hover:text-torus-fg"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="border-b border-torus-border p-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search instruments"
            aria-label="Search instruments"
            className={cx(inputClass, 'w-full')}
          />
          <p className="mt-1.5 text-[11px] text-torus-fg-faint">
            {loading
              ? 'Loading the SoundFont'
              : `${filtered.length} instruments from ${soundfonts.map((s) => s.name).join(', ') || 'no SoundFont'}`}
          </p>
        </div>

        <ul className="torus-scroll flex-1 overflow-y-auto p-1.5">
          {filtered.map((p, index) => (
            // A SoundFont can hold several presets on one bank and program,
            // so the position is part of the key.
            <li key={`${p.bankMSB}-${p.bankLSB}-${p.program}-${index}`}>
              <button
                type="button"
                onClick={() => onPick(presetToRef(p))}
                className="flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-left text-[13px] text-torus-fg-dim transition-colors hover:bg-torus-raised hover:text-torus-fg"
              >
                <span
                  className="w-12 shrink-0 text-[11px] tabular-nums text-torus-fg-faint"
                  title="Bank and program number"
                >
                  {p.bankMSB}:{p.program}
                </span>
                <span className="truncate">{p.name}</span>
                {p.isDrum ? (
                  <span className="ml-auto rounded bg-torus-raised px-1.5 py-0.5 text-[11px] text-torus-fg-dim">
                    Drums
                  </span>
                ) : null}
              </button>
            </li>
          ))}
          {!loading && filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-[13px] text-torus-fg-faint">
              No instrument matches that search
            </li>
          ) : null}
        </ul>

        <div className="border-t border-torus-border p-3">
          <input
            ref={fileRef}
            type="file"
            accept=".sf2,.sf3,.dls,.sfogg"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) await onUploadSoundfont(file);
              e.target.value = '';
            }}
          />
          <Button className="w-full" onClick={() => fileRef.current?.click()}>
            Load a SoundFont file (.sf2, .sf3, .dls)
          </Button>
        </div>
      </div>
    </div>
  );
}
