'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { conductorEngine } from '@/lib/conductor/engine';
import { saveProject } from '@/lib/conductor/project';
import {
  DEFAULT_TRANSCRIBE_OPTIONS,
  friendlyTranscribeError,
  transcribeFile,
  TRANSCRIBE_PHASE_LABELS,
  type NoteEventTime,
  type TranscribeOptions,
  type TranscribeProgress,
} from '@/lib/transcriber/transcribe';
import { partsToMidi, partsToProject, splitNotes, type SplitMode } from '@/lib/transcriber/parts';
import { useToast } from '@/hooks/useToast';
import { useMidiPreview } from './useMidiPreview';

const AUDIO_ACCEPT = 'audio/*,.mp3,.wav,.flac,.ogg,.opus,.m4a,.aac';
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.flac', '.ogg', '.opus', '.m4a', '.aac']);
const INVALID_AUDIO_MSG = 'Please choose an audio file (MP3, WAV, FLAC, OGG, M4A).';

function isAudioFile(file: File): boolean {
  if (file.type.startsWith('audio/')) return true;
  const dot = file.name.lastIndexOf('.');
  if (dot < 0) return false;
  return AUDIO_EXTENSIONS.has(file.name.slice(dot).toLowerCase());
}

type Status = 'idle' | 'working' | 'done' | 'error';

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '') || 'transcription';
}

export function TranscriberApp() {
  const router = useRouter();
  const { toast } = useToast();
  const preview = useMidiPreview();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState<TranscribeProgress>({ fraction: 0, phase: 'decoding' });
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
      setProgress({ fraction: 0, phase: 'decoding' });
      setStale(false);
    },
    [preview],
  );

  const acceptFile = useCallback(
    (f: File) => {
      if (!isAudioFile(f)) {
        toast({ message: INVALID_AUDIO_MSG, variant: 'error' });
        return;
      }
      selectFile(f);
    },
    [selectFile, toast],
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) acceptFile(f);
    },
    [acceptFile],
  );

  const runTranscription = useCallback(async () => {
    if (!file) return;
    preview.stop();
    setStatus('working');
    setError(null);
    setProgress({ fraction: 0, phase: 'decoding' });
    try {
      const result = await transcribeFile(file, analysis, setProgress);
      setNotes(result);
      setStatus('done');
      setStale(false);
    } catch (err) {
      setError(friendlyTranscribeError(err));
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
    if (!notes || noteCount === 0) return;
    const name = `${file ? baseName(file.name) : 'transcription'}.mid`;
    const bytes = partsToMidi(parts, bpm);
    const blob = new Blob([bytes as BlobPart], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({ message: `Downloaded ${name}`, variant: 'success' });
  }, [notes, noteCount, parts, bpm, file, toast]);

  const handleSendToConductor = useCallback(() => {
    if (!project || noteCount === 0) return;
    preview.stop();
    saveProject(project);
    toast({ message: 'Sent to Conductor', variant: 'success' });
    router.push('/conductor' as Route);
  }, [project, noteCount, preview, router, toast]);

  const togglePreview = useCallback(() => {
    if (preview.playing) preview.stop();
    else if (project) {
      void preview.play(project).catch(() => {
        toast({
          message: 'Preview unavailable — instruments are still loading.',
          variant: 'error',
        });
      });
    }
  }, [preview, project, toast]);

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
          aria-label="Choose or drop an audio file"
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
              if (f) acceptFile(f);
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
                ? `${TRANSCRIBE_PHASE_LABELS[progress.phase]} ${Math.round(progress.fraction * 100)}%`
                : notes
                  ? stale
                    ? 'Re-transcribe (settings changed)'
                    : 'Re-transcribe'
                  : 'Transcribe to MIDI'}
            </button>

            {status === 'working' ? (
              <div className="mt-3">
                <p className="mb-1.5 text-xs text-torus-fg-faint">
                  {TRANSCRIBE_PHASE_LABELS[progress.phase]}
                </p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-torus-border">
                  <div
                    className="h-full rounded-full bg-torus-mid transition-[width]"
                    style={{ width: `${Math.max(2, Math.round(progress.fraction * 100))}%` }}
                  />
                </div>
              </div>
            ) : null}

            {error ? <p className="mt-3 text-xs text-torus-bass">{error}</p> : null}
          </section>
        ) : null}

        {/* Result */}
        {notes !== null && project ? (
          <section className="mt-5 rounded-xl border border-torus-border bg-torus-surface/60 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-torus-fg-dim">Result</h2>
              <span className="text-xs text-torus-fg-faint">
                {noteCount} notes · {project.tracks.length} track{project.tracks.length === 1 ? '' : 's'}
              </span>
            </div>

            {noteCount === 0 ? (
              <p className="mt-4 text-sm text-torus-fg-dim">
                No notes detected — try lowering Note confidence, or use a recording with a clearer
                melody.
              </p>
            ) : (
              <>
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
                </div>
              </>
            )}

            <div className={`mt-5 flex ${noteCount === 0 ? '' : 'flex-wrap gap-2'}`}>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className={`rounded-full px-3 py-2 text-xs text-torus-fg-faint transition hover:text-torus-fg-dim ${noteCount > 0 ? 'ml-auto' : ''}`}
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
