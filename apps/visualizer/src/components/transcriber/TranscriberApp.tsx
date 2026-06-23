'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { conductorEngine } from '@/lib/conductor/engine';
import { saveProject, type ConductorProject } from '@/lib/conductor/project';
import { importMidiToProject } from '@/lib/conductor/midiImport';
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
import {
  fetchMidiBytes,
  matchTier,
  searchMidi,
  type MidiSearchResult,
} from '@/lib/transcriber/midiLookup';
import {
  CHORD_PHASE_LABELS,
  chordsToMidi,
  chordsToProject,
  detectChords,
  type ChordProgress,
  type ChordSegment,
  type ChordVoicing,
} from '@/lib/transcriber/chords';
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
type Mode = 'transcribe' | 'find' | 'chords';

interface FoundMidi {
  project: ConductorProject;
  bytes: ArrayBuffer;
  name: string;
}

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

  // "Find existing MIDI" mode.
  const [mode, setMode] = useState<Mode>('transcribe');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<MidiSearchResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [found, setFound] = useState<FoundMidi | null>(null);

  // "Chords" mode.
  const [chordStatus, setChordStatus] = useState<Status>('idle');
  const [chordProgress, setChordProgress] = useState<ChordProgress>({ fraction: 0, phase: 'decoding' });
  const [chordError, setChordError] = useState<string | null>(null);
  const [chords, setChords] = useState<ChordSegment[] | null>(null);
  const [voicing, setVoicing] = useState<ChordVoicing>('block');

  // Warm up the soundfont engine so the first preview is instant.
  useEffect(() => {
    conductorEngine.ensureDefaultSoundfont().catch(() => {});
  }, []);

  const parts = useMemo(() => (notes ? splitNotes(notes, split) : []), [notes, split]);
  const project = useMemo(
    () => (notes ? partsToProject(parts, { bpm, name: file ? baseName(file.name) : 'Transcription' }) : null),
    [notes, parts, bpm, file],
  );

  const chordProject = useMemo(
    () =>
      chords && chords.length > 0
        ? chordsToProject(chords, file ? baseName(file.name) : 'Chords', voicing)
        : null,
    [chords, voicing, file],
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
      setChords(null);
      setChordStatus('idle');
      setChordError(null);
      setChordProgress({ fraction: 0, phase: 'decoding' });
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

  const switchMode = useCallback(
    (m: Mode) => {
      preview.stop();
      setMode(m);
    },
    [preview],
  );

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) return;
    preview.stop();
    setSearching(true);
    setSearchError(null);
    setFound(null);
    try {
      setResults(await searchMidi(q));
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
      setResults(null);
    } finally {
      setSearching(false);
    }
  }, [query, preview]);

  const pickResult = useCallback(
    async (res: MidiSearchResult) => {
      preview.stop();
      setLoadingId(res.id);
      setSearchError(null);
      try {
        const bytes = await fetchMidiBytes(res.id);
        const name = res.name.replace(/\.midi?$/i, '') || 'MIDI';
        // Import from a copy so the original buffer stays intact for download.
        const imported = importMidiToProject(bytes.slice(0), `${name}.mid`);
        setFound({ project: imported, bytes, name });
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : "Couldn't load that MIDI");
      } finally {
        setLoadingId(null);
      }
    },
    [preview],
  );

  const previewFound = useCallback(() => {
    if (!found) return;
    if (preview.playing) preview.stop();
    else
      void preview.play(found.project).catch(() => {
        toast({
          message: 'Preview unavailable — instruments are still loading.',
          variant: 'error',
        });
      });
  }, [found, preview, toast]);

  const downloadFound = useCallback(() => {
    if (!found) return;
    const blob = new Blob([new Uint8Array(found.bytes)], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${found.name}.mid`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({ message: `Downloaded ${found.name}.mid`, variant: 'success' });
  }, [found, toast]);

  const sendFoundToConductor = useCallback(() => {
    if (!found) return;
    preview.stop();
    saveProject(found.project);
    toast({ message: 'Sent to Conductor', variant: 'success' });
    router.push('/conductor' as Route);
  }, [found, preview, router, toast]);

  const runChordDetection = useCallback(async () => {
    if (!file) return;
    preview.stop();
    setChordStatus('working');
    setChordError(null);
    setChordProgress({ fraction: 0, phase: 'decoding' });
    try {
      const segs = await detectChords(file, setChordProgress);
      setChords(segs);
      setChordStatus('done');
    } catch (err) {
      setChordError(friendlyTranscribeError(err));
      setChordStatus('error');
    }
  }, [file, preview]);

  const previewChords = useCallback(() => {
    if (!chordProject) return;
    if (preview.playing) preview.stop();
    else
      void preview.play(chordProject).catch(() => {
        toast({
          message: 'Preview unavailable — instruments are still loading.',
          variant: 'error',
        });
      });
  }, [chordProject, preview, toast]);

  const downloadChords = useCallback(() => {
    if (!chords || chords.length === 0) return;
    const name = `${file ? baseName(file.name) : 'chords'}.mid`;
    const bytes = chordsToMidi(chords, voicing);
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
  }, [chords, voicing, file, toast]);

  const sendChordsToConductor = useCallback(() => {
    if (!chordProject) return;
    preview.stop();
    saveProject(chordProject);
    toast({ message: 'Sent to Conductor', variant: 'success' });
    router.push('/conductor' as Route);
  }, [chordProject, preview, router, toast]);

  return (
    <main className="min-h-dvh bg-torus-bg text-torus-fg">
      <div className="mx-auto max-w-2xl px-4 py-16 md:py-20">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Transcriber</h1>
          <p className="mt-2 text-sm text-torus-fg-dim">
            {mode === 'transcribe'
              ? "Turn audio into MIDI, right in your browser. Powered by Spotify's Basic Pitch — your file never leaves this device."
              : mode === 'find'
                ? 'Grab a ready-made MIDI for popular songs from the BitMidi archive — often far more accurate than transcription.'
                : 'Pull the chord progression out of a song — analyzed right here in your browser, so your file never leaves this device.'}
          </p>
        </header>

        {/* Mode toggle */}
        <div className="mb-5 flex gap-1.5">
          <ModeButton active={mode === 'transcribe'} onClick={() => switchMode('transcribe')}>
            Transcribe
          </ModeButton>
          <ModeButton active={mode === 'find'} onClick={() => switchMode('find')}>
            Find MIDI
          </ModeButton>
          <ModeButton active={mode === 'chords'} onClick={() => switchMode('chords')}>
            Chords
          </ModeButton>
        </div>

        {mode !== 'find' ? (
          <>
        {/* Drop zone (shared by Transcribe + Chords) */}
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

        {/* Analysis options (Transcribe) */}
        {mode === 'transcribe' && file ? (
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

        {/* Result (Transcribe) */}
        {mode === 'transcribe' && notes !== null && project ? (
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

        {/* Chords analysis + result */}
        {mode === 'chords' && file ? (
          <section className="mt-5 rounded-xl border border-torus-border bg-torus-surface/60 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-torus-fg-dim">Chords</h2>
              {chords && chords.length > 0 ? (
                <span className="text-xs text-torus-fg-faint">
                  {chords.length} chord{chords.length === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => void runChordDetection()}
              disabled={chordStatus === 'working'}
              className="mt-3 w-full rounded-full bg-torus-mid px-4 py-2.5 text-sm font-semibold text-torus-bg transition hover:opacity-90 disabled:opacity-50"
            >
              {chordStatus === 'working'
                ? `${CHORD_PHASE_LABELS[chordProgress.phase]} ${Math.round(chordProgress.fraction * 100)}%`
                : chords
                  ? 'Re-detect chords'
                  : 'Find chords'}
            </button>

            {chordStatus === 'working' ? (
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-torus-border">
                <div
                  className="h-full rounded-full bg-torus-mid transition-[width]"
                  style={{ width: `${Math.max(2, Math.round(chordProgress.fraction * 100))}%` }}
                />
              </div>
            ) : null}

            {chordError ? <p className="mt-3 text-xs text-torus-bass">{chordError}</p> : null}

            {chords !== null && chordStatus !== 'working' ? (
              chords.length === 0 ? (
                <p className="mt-4 text-sm text-torus-fg-dim">
                  No clear chords found — try a song with stronger harmony, or use Transcribe for
                  melodic lines.
                </p>
              ) : (
                <>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {chords.map((c) => (
                      <span
                        key={`${c.startSec.toFixed(3)}-${c.label}`}
                        title={`${c.startSec.toFixed(1)}s – ${c.endSec.toFixed(1)}s`}
                        className="rounded-md border border-torus-border bg-torus-bg/40 px-2 py-1 text-xs text-torus-fg"
                      >
                        {c.label}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4">
                    <span className="mb-1.5 block text-xs text-torus-fg-dim">Voicing</span>
                    <div className="flex gap-1.5">
                      <SplitButton active={voicing === 'block'} onClick={() => setVoicing('block')}>
                        Block
                      </SplitButton>
                      <SplitButton active={voicing === 'arp'} onClick={() => setVoicing('arp')}>
                        Arpeggio
                      </SplitButton>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={previewChords}
                      className="rounded-full border border-torus-mid/40 bg-torus-mid/10 px-4 py-2 text-sm font-medium text-torus-mid transition hover:bg-torus-mid/20"
                    >
                      {preview.playing ? '■ Stop' : '▶ Preview'}
                    </button>
                    <button
                      type="button"
                      onClick={downloadChords}
                      className="rounded-full border border-torus-border px-4 py-2 text-sm font-medium text-torus-fg-dim transition hover:border-torus-border-strong hover:text-torus-fg"
                    >
                      Download .mid
                    </button>
                    <button
                      type="button"
                      onClick={sendChordsToConductor}
                      className="rounded-full border border-torus-border px-4 py-2 text-sm font-medium text-torus-fg-dim transition hover:border-torus-border-strong hover:text-torus-fg"
                    >
                      Send to Conductor →
                    </button>
                  </div>
                </>
              )
            ) : null}
          </section>
        ) : null}
          </>
        ) : (
          <>
            {/* Search */}
            <section className="rounded-xl border border-torus-border bg-torus-surface/60 p-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void runSearch();
                  }}
                  placeholder="Song name — e.g. Queen Bohemian Rhapsody"
                  className="min-w-0 flex-1 rounded-full border border-torus-border bg-torus-bg px-4 py-2 text-sm text-torus-fg placeholder:text-torus-fg-faint focus:border-torus-mid/50 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void runSearch()}
                  disabled={searching || query.trim().length < 2}
                  className="shrink-0 rounded-full bg-torus-mid px-4 py-2 text-sm font-semibold text-torus-bg transition hover:opacity-90 disabled:opacity-50"
                >
                  {searching ? 'Searching…' : 'Search'}
                </button>
              </div>
              <p className="mt-2 text-xs text-torus-fg-faint">
                Community-made MIDIs from BitMidi — best for popular &amp; classic songs. Not found?
                Switch to Transcribe audio.
              </p>
              {searchError ? <p className="mt-3 text-xs text-torus-bass">{searchError}</p> : null}
            </section>

            {/* Results */}
            {results !== null ? (
              <section className="mt-5 rounded-xl border border-torus-border bg-torus-surface/60 p-4">
                {results.length === 0 ? (
                  <p className="text-sm text-torus-fg-dim">
                    No matches found. Try a simpler query, e.g. just “artist song”.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {results.map((r) => {
                      const tier = matchTier(r.score);
                      return (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() => void pickResult(r)}
                            disabled={loadingId !== null}
                            className="flex w-full items-center gap-3 rounded-lg border border-torus-border bg-torus-bg/40 px-3 py-2 text-left transition hover:border-torus-mid/40 disabled:opacity-50"
                          >
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                tier === 'match'
                                  ? 'bg-torus-mid/20 text-torus-mid'
                                  : tier === 'maybe'
                                    ? 'bg-torus-border text-torus-fg-dim'
                                    : 'text-torus-fg-faint'
                              }`}
                            >
                              {tier === 'match' ? 'Match' : tier === 'maybe' ? 'Maybe' : '—'}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-torus-fg">{r.name}</span>
                              <span className="block text-[11px] text-torus-fg-faint">
                                {r.views.toLocaleString()} views · {r.plays.toLocaleString()} plays
                              </span>
                            </span>
                            {loadingId === r.id ? (
                              <span className="shrink-0 text-xs text-torus-fg-faint">Loading…</span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ) : null}

            {/* Selected MIDI */}
            {found ? (
              <section className="mt-5 rounded-xl border border-torus-border bg-torus-surface/60 p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-torus-fg-dim">Selected</h2>
                  <span className="text-xs text-torus-fg-faint">
                    {found.project.tracks.length} track{found.project.tracks.length === 1 ? '' : 's'}{' '}
                    · {found.project.bpm} BPM
                  </span>
                </div>
                <p className="mt-2 truncate text-sm text-torus-fg">{found.name}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={previewFound}
                    className="rounded-full border border-torus-mid/40 bg-torus-mid/10 px-4 py-2 text-sm font-medium text-torus-mid transition hover:bg-torus-mid/20"
                  >
                    {preview.playing ? '■ Stop' : '▶ Preview'}
                  </button>
                  <button
                    type="button"
                    onClick={downloadFound}
                    className="rounded-full border border-torus-border px-4 py-2 text-sm font-medium text-torus-fg-dim transition hover:border-torus-border-strong hover:text-torus-fg"
                  >
                    Download .mid
                  </button>
                  <button
                    type="button"
                    onClick={sendFoundToConductor}
                    className="rounded-full border border-torus-border px-4 py-2 text-sm font-medium text-torus-fg-dim transition hover:border-torus-border-strong hover:text-torus-fg"
                  >
                    Send to Conductor →
                  </button>
                </div>
              </section>
            ) : null}
          </>
        )}
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

function ModeButton({
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
      aria-pressed={active}
      className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
        active
          ? 'bg-torus-mid/20 text-torus-mid border border-torus-mid/40'
          : 'border border-torus-border text-torus-fg-dim hover:border-torus-border-strong'
      }`}
    >
      {children}
    </button>
  );
}
