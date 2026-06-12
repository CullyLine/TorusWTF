'use client';

import { useCallback, useRef, useState, type DragEvent, type FormEvent } from 'react';
import type { SourceKind } from '@/hooks/useAudioSource';
import { parseYouTubeVideoId } from '@/components/YouTubePanel';

interface AudioSourcePickerProps {
  activeKind: SourceKind | null;
  fileName: string | null;
  hasSource: boolean;
  error: string | null;
  desktopSupported: boolean;
  demoLoading?: boolean;
  youtubeVideoId: string | null;
  onSelectKind: (kind: SourceKind) => void;
  onDesktopSelect: () => void;
  onShowDesktopGuide: () => void;
  onYouTubeSelect: () => void;
  onYouTubeLoad: (videoId: string) => void;
  onFile: (file: File) => void;
  onTryDemo: () => void;
  onClearSource: () => void;
}

const AUDIO_ACCEPT = 'audio/*,.mp3,.wav,.flac,.ogg,.opus,.m4a,.aac';

type ButtonKey = SourceKind;

interface PickerButton {
  key: ButtonKey;
  label: string;
}

export function AudioSourcePicker({
  activeKind,
  fileName,
  hasSource,
  error,
  desktopSupported,
  demoLoading = false,
  youtubeVideoId,
  onSelectKind,
  onDesktopSelect,
  onShowDesktopGuide,
  onYouTubeSelect,
  onYouTubeLoad,
  onFile,
  onTryDemo,
  onClearSource,
}: AudioSourcePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeParseError, setYoutubeParseError] = useState<string | null>(null);

  const handleYouTubeSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const id = parseYouTubeVideoId(youtubeUrl);
      if (!id) {
        setYoutubeParseError("That doesn't look like a YouTube link.");
        return;
      }
      setYoutubeParseError(null);
      onYouTubeLoad(id);
    },
    [onYouTubeLoad, youtubeUrl],
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  const handleKindClick = useCallback(
    (key: ButtonKey) => {
      if (key === 'tab') {
        onDesktopSelect();
        return;
      }
      if (key === 'youtube') {
        onYouTubeSelect();
        return;
      }
      if (key === 'file' && activeKind === 'file') {
        // Re-clicking File opens the picker so users can swap tracks.
        inputRef.current?.click();
        return;
      }
      onSelectKind(key);
    },
    [activeKind, onDesktopSelect, onSelectKind, onYouTubeSelect],
  );

  const buttons: PickerButton[] = [
    { key: 'file', label: 'File' },
    { key: 'mic', label: 'Mic' },
    { key: 'tab', label: 'Desktop' },
    { key: 'youtube', label: 'YouTube' },
  ];

  const streamActive =
    hasSource && (activeKind === 'mic' || activeKind === 'tab' || activeKind === 'youtube');

  return (
    <section className="rounded-xl border border-torus-border bg-torus-surface/80 p-4 backdrop-blur-md">
      <h2 className="mb-3 text-sm font-medium text-torus-fg-dim">Audio source</h2>
      <div className="mb-3 flex flex-wrap gap-2">
        {buttons.map(({ key, label }) => {
          const isActive = activeKind === key;
          const disabled = (key === 'tab' || key === 'youtube') && !desktopSupported;
          const accent = isActive
            ? 'bg-torus-mid/20 text-torus-mid border border-torus-mid/40'
            : 'border border-torus-border text-torus-fg-dim hover:border-torus-border-strong';

          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => handleKindClick(key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${accent} ${
                disabled ? 'opacity-40 cursor-not-allowed' : ''
              }`}
              title={
                (key === 'tab' || key === 'youtube') && !desktopSupported
                  ? 'Requires Chrome or Edge'
                  : undefined
              }
            >
              {label}
            </button>
          );
        })}
      </div>
      {!desktopSupported ? (
        <p className="mb-3 text-[10px] text-torus-fg-faint">
          Desktop capture needs Chrome or Edge — File and Mic work everywhere.
        </p>
      ) : null}

      {activeKind === 'file' || activeKind === null ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Choose or drop an audio file"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="flex min-h-[88px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-torus-border-strong px-4 py-6 text-center hover:border-torus-mid/50"
        >
          <p className="text-sm text-torus-fg">
            {fileName ?? 'Drop a track, use your mic, or capture desktop audio.'}
          </p>
          <p className="mt-1 text-xs text-torus-fg-faint">
            {fileName ? 'Click to choose a different track' : 'MP3, WAV, FLAC, OGG, Opus, M4A, AAC'}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={AUDIO_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
              e.target.value = '';
            }}
          />
          {!hasSource ? (
            <button
              type="button"
              disabled={demoLoading}
              onClick={(e) => {
                e.stopPropagation();
                onTryDemo();
              }}
              className="mt-3 text-xs text-torus-mid hover:underline disabled:opacity-60"
            >
              {demoLoading ? 'Loading demo\u2026' : 'Try with demo audio'}
            </button>
          ) : null}
        </div>
      ) : activeKind === 'mic' ? (
        hasSource ? (
          <p className="text-sm text-torus-fg-dim">Listening to your microphone.</p>
        ) : (
          <p className="text-sm text-torus-fg-dim">
            Your browser will ask for microphone access.
          </p>
        )
      ) : activeKind === 'youtube' ? (
        <div className="space-y-2">
          <form onSubmit={handleYouTubeSubmit} className="flex gap-2">
            <input
              type="text"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="Paste a YouTube link…"
              aria-label="YouTube link"
              className="min-w-0 flex-1 rounded-lg border border-torus-border bg-torus-bg px-3 py-2 text-sm text-torus-fg"
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg border border-torus-border px-3 py-2 text-xs font-medium text-torus-fg-dim hover:border-torus-mid/40"
            >
              Load
            </button>
          </form>
          {youtubeParseError ? (
            <p className="text-xs text-torus-bass">{youtubeParseError}</p>
          ) : null}
          <p className="text-sm text-torus-fg-dim">
            {hasSource
              ? 'Visualizing the player in the corner.'
              : youtubeVideoId
                ? 'Press play in the corner player, then capture its audio.'
                : 'The video opens in a small player in the corner.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-torus-fg-dim">
            {hasSource
              ? "Capturing audio from your desktop — Spotify, Ableton, Splice, anything that's playing."
              : 'Listen to everything on your computer, or just one application.'}
          </p>
          <button
            type="button"
            onClick={onShowDesktopGuide}
            className="text-xs text-torus-mid hover:underline"
          >
            {hasSource ? 'Change what torus listens to' : 'Choose what to listen to'}
          </button>
        </div>
      )}

      {streamActive ? (
        <button
          type="button"
          onClick={onClearSource}
          className="mt-2 text-xs text-torus-fg-dim hover:text-torus-bass"
        >
          Stop {activeKind === 'mic' ? 'listening' : 'capturing'}
        </button>
      ) : null}

      {error ? <p className="mt-2 text-xs text-torus-bass">{error}</p> : null}
    </section>
  );
}
