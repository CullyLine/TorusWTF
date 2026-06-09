'use client';

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
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
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
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-torus-border-strong bg-torus-bg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-torus-border px-4 py-3">
          <span id={titleId} className="text-sm font-medium">
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-torus-fg-faint hover:text-torus-fg"
            aria-label="Close"
          >
            {'\u2715'}
          </button>
        </div>

        <div className="border-b border-torus-border p-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={'Search presets\u2026'}
            className="w-full rounded-lg border border-torus-border bg-torus-surface px-3 py-2 text-sm outline-none placeholder:text-torus-fg-faint focus:border-torus-border-strong"
          />
          <p className="mt-1.5 text-[11px] text-torus-fg-faint">
            {loading
              ? 'Loading soundfont\u2026'
              : `${filtered.length} presets \u00b7 ${soundfonts.map((s) => s.name).join(', ') || 'no soundfont'}`}
          </p>
        </div>

        <ul className="flex-1 overflow-y-auto p-2">
          {filtered.map((p) => (
            <li key={`${p.bankMSB}-${p.bankLSB}-${p.program}`}>
              <button
                type="button"
                onClick={() => onPick(presetToRef(p))}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-torus-fg-dim transition-colors hover:bg-white/5 hover:text-torus-fg"
              >
                <span className="w-14 shrink-0 font-mono text-[11px] text-torus-fg-faint">
                  {p.bankMSB}:{p.program}
                </span>
                <span className="truncate">{p.name}</span>
                {p.isDrum ? (
                  <span className="ml-auto rounded bg-torus-bass/20 px-1.5 py-0.5 text-[10px] text-torus-bass">
                    drum
                  </span>
                ) : null}
              </button>
            </li>
          ))}
          {!loading && filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-torus-fg-faint">No matching presets</li>
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
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-lg border border-torus-border bg-torus-surface px-3 py-2 text-sm text-torus-fg-dim transition-colors hover:border-torus-border-strong hover:text-torus-fg"
          >
            + Load soundfont (.sf2 / .sf3 / .dls)
          </button>
        </div>
      </div>
    </div>
  );
}
