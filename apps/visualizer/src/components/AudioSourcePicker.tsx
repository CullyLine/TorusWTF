'use client';

import { useCallback, useRef, type DragEvent } from 'react';
import type { SourceKind } from '@/hooks/useAudioSource';

interface AudioSourcePickerProps {
  activeKind: SourceKind | null;
  fileName: string | null;
  hasSource: boolean;
  error: string | null;
  tabSupported: boolean;
  onSelectKind: (kind: SourceKind) => void;
  onFile: (file: File) => void;
  onTryDemo: () => void;
}

const AUDIO_ACCEPT = 'audio/*,.mp3,.wav,.flac,.ogg,.opus,.m4a,.aac';

export function AudioSourcePicker({
  activeKind,
  fileName,
  hasSource,
  error,
  tabSupported,
  onSelectKind,
  onFile,
  onTryDemo,
}: AudioSourcePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <section className="rounded-xl border border-torus-border bg-torus-surface p-4">
      <h2 className="mb-3 text-sm font-medium text-torus-fg-dim">Audio source</h2>
      <div className="mb-3 flex flex-wrap gap-2">
        {(['file', 'mic', 'tab'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            disabled={kind === 'tab' && !tabSupported}
            onClick={() => onSelectKind(kind)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              activeKind === kind
                ? 'bg-torus-mid/20 text-torus-mid border border-torus-mid/40'
                : 'border border-torus-border text-torus-fg-dim hover:border-torus-border-strong'
            } ${kind === 'tab' && !tabSupported ? 'opacity-40 cursor-not-allowed' : ''}`}
            title={kind === 'tab' && !tabSupported ? 'Requires Chrome or Edge' : undefined}
          >
            {kind === 'file' ? 'File' : kind === 'mic' ? 'Mic' : 'Tab'}
          </button>
        ))}
      </div>

      {activeKind === 'file' || activeKind === null ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="flex min-h-[88px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-torus-border-strong px-4 py-6 text-center hover:border-torus-mid/50"
        >
          <p className="text-sm text-torus-fg">
            {fileName ?? 'Drop a track, talk into your mic, or share a tab.'}
          </p>
          <p className="mt-1 text-xs text-torus-fg-faint">MP3, WAV, FLAC, OGG, Opus</p>
          <input
            ref={inputRef}
            type="file"
            accept={AUDIO_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
            }}
          />
          {!hasSource ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTryDemo();
              }}
              className="mt-3 text-xs text-torus-mid hover:underline"
            >
              Try with demo audio
            </button>
          ) : null}
        </div>
      ) : activeKind === 'mic' ? (
        <p className="text-sm text-torus-fg-dim">Listening to your microphone.</p>
      ) : (
        <p className="text-sm text-torus-fg-dim">Capturing audio from a shared browser tab.</p>
      )}

      {error ? <p className="mt-2 text-xs text-torus-bass">{error}</p> : null}
    </section>
  );
}
