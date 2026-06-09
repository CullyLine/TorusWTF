'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { conductorEngine } from '@/lib/conductor/engine';
import { loadProject, saveProject } from '@/lib/conductor/project';
import {
  DEFAULT_TRANSCRIBE_OPTIONS,
  transcribeFile,
  type NoteEventTime,
  type TranscribeOptions,
} from '@/lib/transcriber/transcribe';
import { partsToMidi, partsToProject, splitNotes, type SplitMode } from '@/lib/transcriber/parts';
import { useMidiPreview } from './useMidiPreview';

const AUDIO_ACCEPT = 'audio/*,.mp3,.wav,.flac,.ogg,.opus,.m4a,.aac';

type Status = 'idle' | 'working' | 'done' | 'error';

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '') || 'transcription';
}

export function TranscriberApp() {
  const router = useRouter();
  const preview = useMidiPreview();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<NoteEventTime[] | null>(null);

  // Analysis options (require a (re)run to take effect).
  const [analysis, setAnalysis] = useState<TranscribeOptions>(DEFAULT_TRANSCRIBE_OPTIONS);
  const [stale, setStale] = useState(false); // analysis options changed since last run

  // Output options (live — recompute project/MIDI without re-running the model).
  const [split, setSplit] = useState<SplitMode>('range');
  const [bpm, setBpm] = useState(120);

  // Warm up the soundfont engine so the first preview is instant.
  useEffect(() => {
    conductorEngine.ensureDefaultSoundfont().catch(() => {});
  }, []);

  const parts = useMemo(() => (notes ? splitNotes(notes, split) : []), [notes, split]);
  const project = useMemo(
    () => (notes ? partsToProject(parts, { bpm, name: file ? baseName(file.name) : 'Transcription' }) : null),
    [notes, parts, bpm, file],
  );

  const noteCount = notes?.length ?? 0;

  const selectFile = useCallback(
    (f: File) => {
      preview.stop();
      setFile(f);
      setNotes(null);
      setStatus('idle');
      setError(null);
      setProgress(0);
      setStale(false);
    },
    [preview],
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) selectFile(f);
    },
    [selectFile],
  );

  const runTranscription = useCallback(async () => {
    if (!file) return;
    preview.stop();
    setStatus('working');
    setError(null);
    setProgress(0);
    try {
      const result = await transcribeFile(file, analysis, setProgress);
      setNotes(result);
      setStatus('done');
      setStale(false);
    } catch (err) {
      setError((err as Error).message || 'Transcription failed');
      setStatus('error');
    }
  }, [file, analysis, preview]);

  const updateAnalysis = useCallback(
    (patch: Partial<TranscribeOptions>) => {
      setAnalysis((a) => ({ ...a, ...patch }));
      if (notes) setStale(true);
    },
    [notes],
  );

  const handleDownload = useCallback(() => {
    if (!notes) return;
    const bytes = partsToMidi(parts, bpm);
    const blob = new Blob([bytes as BlobPart], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file ? baseName(file.name) : 'transcription'}.mid`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [notes, parts, bpm, file]);

  const handleSendToConductor = useCallback(() => {
    if (!project) return;
    const existing = loadProject();
    const hasNotes = existing?.tracks?.some((t) => t.clips.some((c) => c.notes.length > 0));
    if (hasNotes && !window.confirm('Replace your current Conductor project with this transcription?')) {
      return;
    }
    preview.stop();
    saveProject(project);
    router.push('/conductor' as Route);
  }, [project, preview, router]);

  const togglePreview = useCallback(() => {
    if (preview.playing) preview.stop();
    else if (project) void preview.play(project);
  }, [preview, project]);

  return (
    <main className="min-h-dvh bg-torus-bg text-torus-fg">
      <div className="mx-auto max-w-2xl px-4 py-16 md:py-20">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Transcriber</h1>
          <p className="mt-2 text-sm text-torus-fg-dim">
            Turn audio into MIDI, right in your browser. Powered by Spotify&apos;s Basic Pitch —
            your file never leaves this device.
          </p>
        </header>

        {/* Drop zone */}
        <section
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-torus-border-strong bg-torus-surface/50 px-4 py-8 text-center transition hover:border-torus-mid/50"
        >
          <p className="text-sm text-torus-fg">{file ? file.name : 'Drop an audio file, or click to choose'}</p>
          <p className="mt-1 text-xs text-torus-fg-faint">MP3, WAV, FLAC, OGG, Opus, M4A</p>
          <input
            ref={inputRef}
            type="file"
            accept={AUDIO_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) selectFile(f);
              e.target.value = '';
            }}
          />
        </section>

        {/* Analysis options */}
        {file ? (
          <section className="mt-5 rounded-xl border border-torus-border bg-torus-surface/60 p-4">
            <h2 className="mb-3 text-sm font-medium text-torus-fg-dim">Detection</h2>
            <div className="space-y-4">
              <SliderRow
                label="Onset sensitivity"
                value={analysis.onsetThreshold}
                min={0.05}
                max={0.95}
                step={0.05}
                format={(v) => v.toFixed(2)}
                onChange={(v) => updateAnalysis({ onsetThreshold: v })}
                hint="Higher = fewer, more confident note starts"
              />
              <SliderRow
                label="Note confidence"
                value={analysis.frameThreshold}
                min={0.05}
                max={0.95}
                step={0.05}
                format={(v) => v.toFixed(2)}
                onChange={(v) => updateAnalysis({ frameThreshold: v })}
                hint="Higher = stricter; drops faint/ghost notes"
              />
              <SliderRow
                label="Min note length"
                value={analysis.minNoteLengthMs}
                min={30}
                max={500}
                step={10}
                format={(v) => `${Math.round(v)} ms`}
                onChange={(v) => updateAnalysis({ minNoteLengthMs: v })}
                hint="Removes very short blips"
              />
            </div>

            <button
              type="button"
              onClick={() => void runTranscription()}
              disabled={status === 'working'}
              className="mt-4 w-full rounded-full bg-torus-mid px-4 py-2.5 text-sm font-semibold text-torus-bg transition hover:opacity-90 disabled:opacity-50"
            >
              {status === 'working'
                ? `Transcribing… ${Math.round(progress * 100)}%`
                : notes
                  ? stale
                    ? 'Re-transcribe (settings changed)'
                    : 'Re-transcribe'
                  : 'Transcribe to MIDI'}
            </button>

            {status === 'working' ? (
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-torus-border">
                <div
                  className="h-full rounded-full bg-torus-mid transition-[width]"
                  style={{ width: `${Math.max(2, Math.round(progress * 100))}%` }}
                />
              </div>
            ) : null}

            {error ? <p className="mt-3 text-xs text-torus-bass">{error}</p> : null}
          </section>
        ) : null}

        {/* Result */}
        {notes && project ? (
          <section className="mt-5 rounded-xl border border-torus-border bg-torus-surface/60 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-torus-fg-dim">Result</h2>
              <span className="text-xs text-torus-fg-faint">
                {noteCount} notes · {project.tracks.length} track{project.tracks.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <span className="mb-1.5 block text-xs text-torus-fg-dim">Instruments</span>
                <div className="flex gap-1.5">
                  <SplitButton active={split === 'none'} onClick={() => setSplit('none')}>
                    Single track
                  </SplitButton>
                  <SplitButton active={split === 'range'} onClick={() => setSplit('range')}>
                    Bass / Mid / Lead
                  </SplitButton>
                </div>
              </div>
              <SliderRow
                label="Tempo"
                value={bpm}
                min={40}
                max={240}
                step={1}
                format={(v) => `${Math.round(v)} BPM`}
                onChange={(v) => setBpm(Math.round(v))}
                hint="Used when laying notes onto the grid"
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={togglePreview}
                className="rounded-full border border-torus-mid/40 bg-torus-mid/10 px-4 py-2 text-sm font-medium text-torus-mid transition hover:bg-torus-mid/20"
              >
                {preview.playing ? '■ Stop' : '▶ Preview'}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="rounded-full border border-torus-border px-4 py-2 text-sm font-medium text-torus-fg-dim transition hover:border-torus-border-strong hover:text-torus-fg"
              >
                Download .mid
              </button>
              <button
                type="button"
                onClick={handleSendToConductor}
                className="rounded-full border border-torus-border px-4 py-2 text-sm font-medium text-torus-fg-dim transition hover:border-torus-border-strong hover:text-torus-fg"
              >
                Send to Conductor →
              </button>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="ml-auto rounded-full px-3 py-2 text-xs text-torus-fg-faint transition hover:text-torus-fg-dim"
              >
                New file
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  hint?: string;
}

function SliderRow({ label, value, min, max, step, format, onChange, hint }: SliderRowProps) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-xs">
        <span className="text-torus-fg-dim">{label}</span>
        <span className="tabular-nums text-torus-fg-faint">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-torus-mid"
      />
      {hint ? <span className="mt-0.5 block text-[10px] text-torus-fg-faint">{hint}</span> : null}
    </label>
  );
}

function SplitButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
        active
          ? 'bg-torus-mid/20 text-torus-mid border border-torus-mid/40'
          : 'border border-torus-border text-torus-fg-dim hover:border-torus-border-strong'
      }`}
    >
      {children}
    </button>
  );
}
