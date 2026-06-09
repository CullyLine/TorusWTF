'use client';

import Link from 'next/link';
import type { OverlayPosition, TitleOverlay } from '@/lib/storage';

interface TitleOverlayPanelProps {
  overlay: TitleOverlay;
  onChange: (patch: Partial<TitleOverlay>) => void;
  unlocked: boolean;
}

const POSITIONS: { id: OverlayPosition; label: string }[] = [
  { id: 'bottom-left', label: 'Bottom left' },
  { id: 'bottom-center', label: 'Bottom center' },
  { id: 'top-left', label: 'Top left' },
  { id: 'top-right', label: 'Top right' },
];

export function TitleOverlayPanel({ overlay, onChange, unlocked }: TitleOverlayPanelProps) {
  return (
    <section className="rounded-xl border border-torus-border bg-torus-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-torus-fg-dim">Title card</h2>
        <label className="flex items-center gap-2 text-xs text-torus-fg-dim">
          <input
            type="checkbox"
            checked={overlay.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
            className="accent-torus-mid"
          />
          Show on export
        </label>
      </div>

      <div className="space-y-2">
        <label className="block text-xs text-torus-fg-dim">
          Title
          <input
            type="text"
            value={overlay.title}
            placeholder="Track name"
            onChange={(e) => onChange({ title: e.target.value })}
            className="mt-1 w-full rounded-lg border border-torus-border bg-torus-bg px-2 py-1.5 text-sm text-torus-fg"
          />
        </label>
        <label className="block text-xs text-torus-fg-dim">
          Subtitle
          <input
            type="text"
            value={overlay.subtitle}
            placeholder="Artist · label"
            onChange={(e) => onChange({ subtitle: e.target.value })}
            className="mt-1 w-full rounded-lg border border-torus-border bg-torus-bg px-2 py-1.5 text-sm text-torus-fg"
          />
        </label>
      </div>

      {unlocked ? (
        <div className="mt-3 space-y-3 border-t border-torus-border pt-3">
          <label className="block text-xs text-torus-fg-dim">
            Position
            <select
              value={overlay.position}
              onChange={(e) => onChange({ position: e.target.value as OverlayPosition })}
              className="mt-1 w-full rounded-lg border border-torus-border bg-torus-bg px-2 py-1.5 text-sm text-torus-fg"
            >
              {POSITIONS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-torus-fg-dim">
              Text color
              <input
                type="color"
                value={overlay.textColor}
                onChange={(e) => onChange({ textColor: e.target.value })}
                className="mt-1 h-8 w-full cursor-pointer rounded border border-torus-border bg-transparent"
              />
            </label>
            <label className="text-xs text-torus-fg-dim">
              Bar opacity
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={overlay.bgOpacity}
                onChange={(e) => onChange({ bgOpacity: Number(e.target.value) })}
                className="mt-3 w-full accent-torus-mid"
              />
            </label>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-[10px] text-torus-fg-faint">
          Free: bottom-left brand card.{' '}
          <Link href="/license" className="text-torus-mid hover:underline">
            Get the license
          </Link>{' '}
          to move it and recolor it.
        </p>
      )}

      <p className="mt-3 text-[10px] text-torus-fg-faint">
        Burned into exports only — your live preview stays clean.
      </p>
    </section>
  );
}
