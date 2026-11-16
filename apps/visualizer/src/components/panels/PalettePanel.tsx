'use client';

import { useRef } from 'react';
import type { WaveformPalette } from '@torus/shared';
import { Section, TextButton, cx } from '@/components/ui/controls';
import { BUILTIN_PALETTES } from '@/lib/palettes';

interface PalettePanelProps {
  palette: WaveformPalette;
  onPaletteChange: (palette: WaveformPalette) => void;
  /** Extracts a palette from an image file, for example album art. */
  onPickPaletteImage: (file: File) => void;
}

const BANDS = ['bass', 'mid', 'high'] as const;

function samePalette(a: WaveformPalette, b: WaveformPalette): boolean {
  return BANDS.every((band) => a[band].toLowerCase() === b[band].toLowerCase());
}

/** Picks the three band colors: a built-in set, colors from an image, or custom. */
export function PalettePanel({ palette, onPaletteChange, onPickPaletteImage }: PalettePanelProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);

  return (
    <Section
      title="Palette"
      action={
        <TextButton
          onClick={() => imageInputRef.current?.click()}
          title="Take the bass, mid, and high colors from an image, such as album art"
        >
          From image
        </TextButton>
      }
    >
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPickPaletteImage(file);
          e.target.value = '';
        }}
      />

      <div className="grid grid-cols-2 gap-1.5">
        {BUILTIN_PALETTES.map((preset) => {
          const selected = samePalette(preset.palette, palette);
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onPaletteChange(preset.palette)}
              className={cx(
                'flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors',
                selected
                  ? 'border-torus-mid bg-torus-raised text-torus-fg'
                  : 'border-torus-border text-torus-fg-dim hover:border-torus-border-strong hover:text-torus-fg',
              )}
            >
              <span className="flex shrink-0 overflow-hidden rounded-sm" aria-hidden="true">
                {BANDS.map((band) => (
                  <span
                    key={band}
                    className="h-3.5 w-2.5"
                    style={{ background: preset.palette[band] }}
                  />
                ))}
              </span>
              <span className="truncate">{preset.label}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {BANDS.map((band) => (
          <label key={band} className="text-[11px] capitalize text-torus-fg-faint">
            {band}
            <input
              type="color"
              value={palette[band]}
              onChange={(e) => onPaletteChange({ ...palette, [band]: e.target.value })}
              className="mt-1 h-8 w-full cursor-pointer rounded-md border border-torus-border bg-transparent"
            />
          </label>
        ))}
      </div>
    </Section>
  );
}
