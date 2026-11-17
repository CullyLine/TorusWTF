'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react';
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
import { TopBar } from '@/components/TopBar';
import { Button, Hint, Segmented, SliderField, cx, inputClass } from '@/components/ui/controls';
import { PlayIcon, StopIcon } from '@/components/ui/icons';
import { useToast } from '@/hooks/useToast';
import { useMidiPreview } from './useMidiPreview';

const AUDIO_ACCEPT = 'audio/*,.mp3,.wav,.flac,.ogg,.opus,.m4a,.aac';
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.flac', '.ogg', '.opus', '.m4a', '.aac']);
const INVALID_AUDIO_MSG = 'That is not an audio file. Choose an MP3, WAV, FLAC, OGG, or M4A.';

function isAudioFile(file: File): boolean {
  if (file.type.startsWith('audio/')) return true;
  const dot = file.name.lastIndexOf('.');
  if (dot < 0) return false;
  return AUDIO_EXTENSIONS.has(file.name.slice(dot).toLowerCase());
}

type Status = 'idle' | 'working' | 'done' | 'error';
type Mode = 'transcribe' | 'find' | 'chords';

const MODE_OPTIONS: ReadonlyArray<{ value: Mode; label: string }> = [
  { value: 'transcribe', label: 'Transcribe' },
  { value: 'find', label: 'Find a MIDI' },
  { value: 'chords', label: 'Chords' },
];

const MODE_DESCRIPTIONS: Record<Mode, string> = {
  transcribe:
    "Convert audio to MIDI in your browser with Spotify's Basic Pitch model. Your file never leaves this device.",
  find: 'Search the BitMidi archive for a ready-made MIDI of a popular song. These are often more accurate than a transcription.',
  chords:
    'Extract the chord progression from a song, including 7ths, 9ths, sus and add chords, and slash-chord inversions. The analysis runs in your browser, so your file never leaves this device.',
};

const SPLIT_OPTIONS: ReadonlyArray<{ value: SplitMode; label: string }> = [
  { value: 'none', label: 'Single track' },
  { value: 'range', label: 'Bass, mid, lead' },
];

const VOICING_OPTIONS: ReadonlyArray<{ value: ChordVoicing; label: string }> = [
  { value: 'block', label: 'Block' },
  { value: 'arp', label: 'Arpeggio' },
];

const TIER_LABELS = { match: 'Match', maybe: 'Maybe', weak: 'Weak' } as const;

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

  // Output options (live, recompute project/MIDI without re-running the model).
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
  const [chordProgress, setChordProgress] = useState<ChordProgress>({
    fraction: 0,
    phase: 'decoding',
  });
  const [chordError, setChordError] = useState<string | null>(null);
  const [chords, setChords] = useState<ChordSegment[] | null>(null);
  const [voicing, setVoicing] = useState<ChordVoicing>('block');

  // Warm up the soundfont engine so the first preview is instant.
  useEffect(() => {
    conductorEngine.ensureDefaultSoundfont().catch(() => {});
  }, []);

  const parts = useMemo(() => (notes ? splitNotes(notes, split) : []), [notes, split]);
  const project = useMemo(
    () =>
      notes
        ? partsToProject(parts, { bpm, name: file ? baseName(file.name) : 'Transcription' })
        : null,
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
    toast({ message: 'Opened in Conductor', variant: 'success' });
    router.push('/conductor' as Route);
  }, [project, noteCount, preview, router, toast]);

  const togglePreview = useCallback(() => {
    if (preview.playing) preview.stop();
    else if (project) {
      void preview.play(project).catch(() => {
        toast({
          message: 'The preview is not ready yet. Instruments are still loading.',
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
          message: 'The preview is not ready yet. Instruments are still loading.',
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
    toast({ message: 'Opened in Conductor', variant: 'success' });
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
          message: 'The preview is not ready yet. Instruments are still loading.',
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
    toast({ message: 'Opened in Conductor', variant: 'success' });
    router.push('/conductor' as Route);
  }, [chordProject, preview, router, toast]);

  return (
    <div className="flex min-h-dvh flex-col bg-torus-bg text-torus-fg">
      <TopBar app="transcriber" />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 md:py-12">
        <Segmented ariaLabel="Tool" value={mode} options={MODE_OPTIONS} onChange={switchMode} />
        <p className="mt-4 text-sm leading-relaxed text-torus-fg-dim">{MODE_DESCRIPTIONS[mode]}</p>

        {mode !== 'find' ? (
          <>
            {/* The drop zone is shared by Transcribe and Chords. */}
            <div
              role="button"
              aria-label="Choose or drop an audio file"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="mt-5 cursor-pointer rounded-md border border-dashed border-torus-border-strong px-4 py-8 text-center hover:border-torus-mid"
            >
              <p className="truncate text-sm text-torus-fg">
                {file ? file.name : 'Drop an audio file, or click to choose one'}
              </p>
              <p className="mt-1 text-xs text-torus-fg-faint">
                {file ? 'Click to choose a different file' : 'MP3, WAV, FLAC, OGG, Opus, M4A'}
              </p>
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
            </div>

            {mode === 'transcribe' && file ? (
              <Card title="Detection">
                <div className="space-y-4">
                  <TunedSlider
                    label="Onset sensitivity"
                    value={analysis.onsetThreshold}
                    min={0.05}
                    max={0.95}
                    step={0.05}
                    readout={analysis.onsetThreshold.toFixed(2)}
                    onChange={(v) => updateAnalysis({ onsetThreshold: v })}
                    hint="Higher values keep fewer, more confident note starts."
                  />
                  <TunedSlider
                    label="Note confidence"
                    value={analysis.frameThreshold}
                    min={0.05}
                    max={0.95}
                    step={0.05}
                    readout={analysis.frameThreshold.toFixed(2)}
                    onChange={(v) => updateAnalysis({ frameThreshold: v })}
                    hint="Higher values are stricter and drop faint notes."
                  />
                  <TunedSlider
                    label="Shortest note"
                    value={analysis.minNoteLengthMs}
                    min={30}
                    max={500}
                    step={10}
                    readout={`${Math.round(analysis.minNoteLengthMs)} ms`}
                    onChange={(v) => updateAnalysis({ minNoteLengthMs: v })}
                    hint="Notes shorter than this are removed."
                  />
                </div>

                {/* Once a result is current, the next step is in the Result card. */}
                <Button
                  variant={notes && !stale ? 'secondary' : 'primary'}
                  className="mt-4 w-full"
                  onClick={() => void runTranscription()}
                  disabled={status === 'working'}
                >
                  {status === 'working'
                    ? `${TRANSCRIBE_PHASE_LABELS[progress.phase]} ${Math.round(progress.fraction * 100)}%`
                    : notes
                      ? stale
                        ? 'Transcribe again with the new settings'
                        : 'Transcribe again'
                      : 'Transcribe to MIDI'}
                </Button>

                {status === 'working' ? <ProgressBar fraction={progress.fraction} /> : null}
                {error ? <p className="mt-3 text-xs text-torus-bass">{error}</p> : null}
              </Card>
            ) : null}

            {mode === 'transcribe' && notes !== null && project ? (
              <Card
                title="Result"
                aside={`${noteCount} ${noteCount === 1 ? 'note' : 'notes'} on ${project.tracks.length} ${
                  project.tracks.length === 1 ? 'track' : 'tracks'
                }`}
              >
                {noteCount === 0 ? (
                  <p className="text-sm text-torus-fg-dim">
                    No notes detected. Lower Note confidence, or use a recording with a clearer
                    melody.
                  </p>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <span className="mb-1 block text-xs text-torus-fg-dim">Tracks</span>
                        <Segmented
                          ariaLabel="Tracks"
                          value={split}
                          options={SPLIT_OPTIONS}
                          onChange={setSplit}
                        />
                      </div>
                      <TunedSlider
                        label="Tempo"
                        value={bpm}
                        min={40}
                        max={240}
                        step={1}
                        readout={`${Math.round(bpm)} BPM`}
                        onChange={(v) => setBpm(Math.round(v))}
                        hint="Used to place the notes on the grid."
                      />
                    </div>
                    <MidiActions
                      playing={preview.playing}
                      onTogglePreview={togglePreview}
                      onDownload={handleDownload}
                      onOpenInConductor={handleSendToConductor}
                    />
                  </>
                )}
              </Card>
            ) : null}

            {mode === 'chords' && file ? (
              <Card
                title="Chords"
                aside={
                  chords && chords.length > 0
                    ? `${chords.length} ${chords.length === 1 ? 'chord' : 'chords'}`
                    : undefined
                }
              >
                <Button
                  variant={chords && chords.length > 0 ? 'secondary' : 'primary'}
                  className="w-full"
                  onClick={() => void runChordDetection()}
                  disabled={chordStatus === 'working'}
                >
                  {chordStatus === 'working'
                    ? `${CHORD_PHASE_LABELS[chordProgress.phase]} ${Math.round(chordProgress.fraction * 100)}%`
                    : chords
                      ? 'Find chords again'
                      : 'Find chords'}
                </Button>

                {chordStatus === 'working' ? (
                  <ProgressBar fraction={chordProgress.fraction} />
                ) : null}
                {chordError ? <p className="mt-3 text-xs text-torus-bass">{chordError}</p> : null}

                {chords !== null && chordStatus !== 'working' ? (
                  chords.length === 0 ? (
                    <p className="mt-4 text-sm text-torus-fg-dim">
                      No clear chords found. Try a song with stronger harmony, or use Transcribe for
                      a melody.
                    </p>
                  ) : (
                    <>
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {chords.map((c) => (
                          <span
                            key={`${c.startSec.toFixed(3)}-${c.label}`}
                            title={`${c.startSec.toFixed(1)}s to ${c.endSec.toFixed(1)}s`}
                            className="rounded-md bg-torus-raised px-2 py-1 text-xs text-torus-fg"
                          >
                            {c.label}
                          </span>
                        ))}
                      </div>

                      <div className="mt-4 max-w-xs">
                        <span className="mb-1 block text-xs text-torus-fg-dim">Voicing</span>
                        <Segmented
                          ariaLabel="Voicing"
                          value={voicing}
                          options={VOICING_OPTIONS}
                          onChange={setVoicing}
                        />
                      </div>

                      <MidiActions
                        playing={preview.playing}
                        onTogglePreview={previewChords}
                        onDownload={downloadChords}
                        onOpenInConductor={sendChordsToConductor}
                      />
                    </>
                  )
                ) : null}
              </Card>
            ) : null}
          </>
        ) : (
          <>
            <Card title="Search">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void runSearch();
                  }}
                  placeholder="Artist and song title"
                  aria-label="Song to search for"
                  className={cx(inputClass, 'min-w-0 flex-1 py-2')}
                />
                <Button
                  variant="primary"
                  onClick={() => void runSearch()}
                  disabled={searching || query.trim().length < 2}
                >
                  {searching ? 'Searching' : 'Search'}
                </Button>
              </div>
              <Hint className="mt-2">
                BitMidi hosts community-made MIDIs, mostly of popular and classic songs. If your
                song is not there, use Transcribe.
              </Hint>
              {searchError ? <p className="mt-3 text-xs text-torus-bass">{searchError}</p> : null}
            </Card>

            {results !== null ? (
              <Card title="Results">
                {results.length === 0 ? (
                  <p className="text-sm text-torus-fg-dim">
                    No matches. Try a shorter search, such as the artist and the song title.
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
                            className="flex w-full items-center gap-3 rounded-md border border-torus-border bg-torus-bg px-3 py-2 text-left transition-colors hover:border-torus-border-strong disabled:opacity-50"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-torus-fg">{r.name}</span>
                              <span className="block text-[11px] tabular-nums text-torus-fg-faint">
                                {r.views.toLocaleString()} views, {r.plays.toLocaleString()} plays
                              </span>
                            </span>
                            <span
                              className={cx(
                                'shrink-0 text-xs',
                                tier === 'match'
                                  ? 'font-medium text-torus-mid'
                                  : 'text-torus-fg-faint',
                              )}
                            >
                              {loadingId === r.id ? 'Loading' : TIER_LABELS[tier]}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            ) : null}

            {found ? (
              <Card
                title="Selected"
                aside={`${found.project.tracks.length} ${
                  found.project.tracks.length === 1 ? 'track' : 'tracks'
                } at ${found.project.bpm} BPM`}
              >
                <p className="truncate text-sm text-torus-fg">{found.name}</p>
                <MidiActions
                  playing={preview.playing}
                  onTogglePreview={previewFound}
                  onDownload={downloadFound}
                  onOpenInConductor={sendFoundToConductor}
                />
              </Card>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}

interface CardProps {
  title: string;
  /** A short summary shown at the right of the title. */
  aside?: string;
  children: ReactNode;
}

/** One step of the page: a titled block with its controls and result. */
function Card({ title, aside, children }: CardProps) {
  return (
    <section className="mt-5 rounded-md border border-torus-border bg-torus-panel p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold text-torus-fg">{title}</h2>
        {aside ? <span className="text-xs tabular-nums text-torus-fg-faint">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

interface TunedSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** The value as text, with its unit. */
  readout: string;
  onChange: (value: number) => void;
  hint: string;
}

/** A slider with its effect spelled out underneath. */
function TunedSlider({ readout, hint, ...slider }: TunedSliderProps) {
  return (
    <div>
      <SliderField {...slider} readout={<span className="tabular-nums">{readout}</span>} />
      <Hint className="mt-1">{hint}</Hint>
    </div>
  );
}

function ProgressBar({ fraction }: { fraction: number }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fraction * 100)}
      className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-torus-border-strong"
    >
      <div
        className="h-full bg-torus-mid transition-[width]"
        style={{ width: `${Math.max(2, Math.round(fraction * 100))}%` }}
      />
    </div>
  );
}

interface MidiActionsProps {
  playing: boolean;
  onTogglePreview: () => void;
  onDownload: () => void;
  onOpenInConductor: () => void;
}

/** What you can do with a finished MIDI: hear it, save it, or keep editing it. */
function MidiActions({
  playing,
  onTogglePreview,
  onDownload,
  onOpenInConductor,
}: MidiActionsProps) {
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      <Button onClick={onTogglePreview}>
        {playing ? <StopIcon /> : <PlayIcon />}
        {playing ? 'Stop' : 'Preview'}
      </Button>
      <Button onClick={onDownload}>Download .mid</Button>
      <Button variant="primary" onClick={onOpenInConductor}>
        Open in Conductor
      </Button>
    </div>
  );
}
