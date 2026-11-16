'use client';

import { Hint, Section, TextButton } from '@/components/ui/controls';
import { CloseIcon } from '@/components/ui/icons';
import { loadSavedPresets, persistSavedPresets, type SavedPreset } from '@/lib/storage';

interface SavedLooksProps {
  onLoad: (preset: SavedPreset) => void;
  onSaveCurrent: () => void;
  /** Changes whenever the stored list changes, so the grid re-reads it. */
  version: number;
  onChange: () => void;
}

/** Looks the user has saved in this browser, as a thumbnail grid. */
export function SavedLooks({ onLoad, onSaveCurrent, version, onChange }: SavedLooksProps) {
  // Read on every render. `version` is the signal that storage changed.
  void version;
  const saved = loadSavedPresets();

  return (
    <Section
      title="Saved looks"
      action={<TextButton onClick={onSaveCurrent}>Save current</TextButton>}
    >
      {saved.length === 0 ? (
        <Hint>
          Nothing saved yet. Save current keeps the visualizer, palette, and every slider in this
          browser.
        </Hint>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {saved.map((preset) => (
            <div
              key={preset.id}
              className="group relative overflow-hidden rounded-md border border-torus-border bg-torus-bg"
            >
              <button
                type="button"
                onClick={() => onLoad(preset)}
                className="block w-full text-left"
                title={`Load "${preset.name}"`}
              >
                <div className="aspect-video w-full bg-torus-raised">
                  {preset.thumbnail ? (
                    <img src={preset.thumbnail} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <span className="block truncate px-2 py-1 text-xs text-torus-fg-dim group-hover:text-torus-fg">
                  {preset.name}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  persistSavedPresets(saved.filter((other) => other.id !== preset.id));
                  onChange();
                }}
                aria-label={`Delete "${preset.name}"`}
                className="absolute right-1 top-1 rounded bg-torus-bg p-1 text-torus-fg-dim hover:text-torus-bass"
              >
                <CloseIcon width="12" height="12" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
