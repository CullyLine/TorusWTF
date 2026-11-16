'use client';

import { useRef, type ChangeEvent } from 'react';
import { Button, Hint, Section } from '@/components/ui/controls';
import {
  buildShowFile,
  downloadShowFile,
  parseShowFile,
  type ShowFileState,
  type TorusShowFile,
} from '@/lib/showFile';

interface ShowPanelProps {
  /** Snapshots the current look. Called when the user clicks save. */
  buildState: () => ShowFileState;
  /** Applies a show file that parsed successfully. */
  onImport: (show: TorusShowFile) => void;
  /** Reports a message the user should see, as a toast. */
  onError: (message: string) => void;
  /** Restores the factory look after the user confirms. */
  onReset: () => void;
  projectorOpen: boolean;
  onOpenProjector: () => void;
}

/** Sending the output to a second screen, and saving the whole setup to a file. */
export function ShowPanel({
  buildState,
  onImport,
  onError,
  onReset,
  projectorOpen,
  onOpenProjector,
}: ShowPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const result = parseShowFile(await file.text());
      if (result.ok) onImport(result.show);
      else onError(result.error);
    } catch {
      onError("Couldn't read that file.");
    }
  }

  return (
    <>
      <Section title="Second screen" defaultOpen={false}>
        <Button className="w-full" onClick={onOpenProjector}>
          {projectorOpen ? 'Projector is open. Bring it to front' : 'Open the projector window'}
        </Button>
        <Hint>
          A window with only the visuals, for a projector or second display. Drag it there and
          double-click it for fullscreen.
        </Hint>
      </Section>

      <Section title="Show file" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => downloadShowFile(buildShowFile(buildState()))}>
            Save to file
          </Button>
          <Button onClick={() => inputRef.current?.click()}>Load from file</Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => void handleFileChange(e)}
        />
        <Hint>
          A show file holds the whole setup: visualizer, palette, sliders, effects, triggers,
          modulations, and saved looks. Use it to move between browsers or share a setup.
        </Hint>
        <Button variant="danger" size="sm" onClick={onReset}>
          Reset the look to defaults
        </Button>
      </Section>
    </>
  );
}
