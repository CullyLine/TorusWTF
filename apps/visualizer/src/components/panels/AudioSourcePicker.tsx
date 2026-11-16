'use client';

import { useCallback, useRef, useState, type DragEvent, type FormEvent } from 'react';
import type { SourceKind } from '@/hooks/useAudioSource';
import { parseYouTubeVideoId } from '@/components/studio/YouTubePanel';
import {
  Button,
  Hint,
  Section,
  Segmented,
  TextButton,
  cx,
  inputClass,
} from '@/components/ui/controls';

interface AudioSourcePickerProps {
  activeKind: SourceKind | null;
  fileName: string | null;
  hasSource: boolean;
  error: string | null;
  /** Desktop and YouTube capture need `getDisplayMedia` audio, which only Chromium has. */
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

export const AUDIO_ACCEPT = 'audio/*,.mp3,.wav,.flac,.ogg,.opus,.m4a,.aac';

const KIND_LABELS: Record<SourceKind, string> = {
  file: 'File',
  mic: 'Mic',
  tab: 'Desktop',
  youtube: 'YouTube',
};

const KINDS: SourceKind[] = ['file', 'mic', 'tab', 'youtube'];

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
      // The stage also accepts drops. Stop here so the file loads once.
      e.stopPropagation();
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  const handleKindClick = useCallback(
    (kind: SourceKind) => {
      if (kind === 'tab') {
        onDesktopSelect();
        return;
      }
      if (kind === 'youtube') {
        onYouTubeSelect();
        return;
      }
      if (kind === 'file' && activeKind === 'file') {
        // Choosing File again opens the picker so a new track can replace the current one.
        inputRef.current?.click();
        return;
      }
      onSelectKind(kind);
    },
    [activeKind, onDesktopSelect, onSelectKind, onYouTubeSelect],
  );

  const streamActive =
    hasSource && (activeKind === 'mic' || activeKind === 'tab' || activeKind === 'youtube');

  return (
    <Section title="Audio source">
      <Segmented
        ariaLabel="Audio source"
        value={activeKind}
        onChange={handleKindClick}
        options={KINDS.map((kind) => {
          const needsChromium = (kind === 'tab' || kind === 'youtube') && !desktopSupported;
          return {
            value: kind,
            label: KIND_LABELS[kind],
            disabled: needsChromium,
            title: needsChromium ? 'Needs Chrome or Edge' : undefined,
          };
        })}
      />
      {!desktopSupported ? (
        <Hint>
          Desktop and YouTube capture need Chrome or Edge. File and Mic work in every browser.
        </Hint>
      ) : null}

      {activeKind === 'file' || activeKind === null ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Choose or drop an audio file"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="cursor-pointer rounded-md border border-dashed border-torus-border-strong px-4 py-5 text-center hover:border-torus-mid"
        >
          <p className="truncate text-[13px] text-torus-fg">
            {fileName ?? 'Drop an audio file, or click to choose one'}
          </p>
          <p className="mt-1 text-[11px] text-torus-fg-faint">
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
        </div>
      ) : activeKind === 'mic' ? (
        <p className="text-[13px] text-torus-fg-dim">
          {hasSource
            ? 'Listening to your microphone.'
            : 'Your browser will ask for microphone access.'}
        </p>
      ) : activeKind === 'youtube' ? (
        <div className="space-y-2">
          <form onSubmit={handleYouTubeSubmit} className="flex gap-2">
            <input
              type="text"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="Paste a YouTube link"
              aria-label="YouTube link"
              className={cx(inputClass, 'min-w-0 flex-1')}
            />
            <Button type="submit">Load</Button>
          </form>
          {youtubeParseError ? (
            <p className="text-xs text-torus-bass">{youtubeParseError}</p>
          ) : null}
          <p className="text-[13px] text-torus-fg-dim">
            {hasSource
              ? 'Visualizing the player in the corner.'
              : youtubeVideoId
                ? 'Press play in the corner player, then capture its audio.'
                : 'The video opens in a small player in the corner.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[13px] text-torus-fg-dim">
            {hasSource
              ? 'Capturing audio from your desktop.'
              : 'Listen to everything on your computer, or to one application.'}
          </p>
          <TextButton onClick={onShowDesktopGuide}>
            {hasSource ? 'Change what torus listens to' : 'Choose what to listen to'}
          </TextButton>
        </div>
      )}

      {!hasSource && (activeKind === 'file' || activeKind === null) ? (
        <Button variant="secondary" className="w-full" disabled={demoLoading} onClick={onTryDemo}>
          {demoLoading ? 'Loading the demo track' : 'Play the demo track'}
        </Button>
      ) : null}

      {streamActive ? (
        <Button variant="danger" size="sm" onClick={onClearSource}>
          Stop {activeKind === 'mic' ? 'listening' : 'capturing'}
        </Button>
      ) : null}

      {error ? <p className="text-xs text-torus-bass">{error}</p> : null}
    </Section>
  );
}
