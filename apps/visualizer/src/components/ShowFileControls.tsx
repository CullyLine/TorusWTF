'use client';

import { useRef, type ChangeEvent, type JSX } from 'react';
import {
  buildShowFile,
  downloadShowFile,
  parseShowFile,
  type ShowFileState,
  type TorusShowFile,
} from '../lib/showFile';

interface ShowFileControlsProps {
  /** Snapshot the current app state (called at click time). */
  buildState: () => ShowFileState;
  /** Apply a successfully imported show to the app. */
  onImport: (show: TorusShowFile) => void;
  /** Surface a user-facing error message (goes to a toast). */
  onError: (message: string) => void;
}

export function ShowFileControls({
  buildState,
  onImport,
  onError,
}: ShowFileControlsProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleExport() {
    downloadShowFile(buildShowFile(buildState()));
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const result = parseShowFile(text);
      if (result.ok) {
        onImport(result.show);
      } else {
        onError(result.error);
      }
    } catch {
      onError("Couldn't read that file.");
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className="text-[10px] text-torus-mid hover:underline"
        onClick={handleExport}
      >
        Export show
      </button>
      <button
        type="button"
        className="text-[10px] text-torus-mid hover:underline"
        onClick={() => inputRef.current?.click()}
      >
        Import show…
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
