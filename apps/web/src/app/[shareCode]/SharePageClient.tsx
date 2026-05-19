'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { Logo, ShareCard } from '@torus/ui';
import type { PeaksJson, WaveformPalette, ClipStatus } from '@torus/shared';
import { AuthNav } from '@/components/AuthNav';
import { ClipPlayer } from '@/components/ClipPlayer';
import { UploadButton } from '@/components/UploadButton';

interface SharePageClientProps {
  shareCode: string;
  shareUrl: string;
  title: string | null;
  status: ClipStatus;
  statusError: string | null;
  durationMs: number | null;
  palette: WaveformPalette | null;
  audioUrl: string | null;
  peaksUrl: string | null;
  spectrogramUrl: string | null;
  allowDownload: boolean;
  originalKey: string | null;
  creatorHandle: string | null;
  creatorLabel: string | null;
}

export function SharePageClient(props: SharePageClientProps) {
  const [peaks, setPeaks] = useState<PeaksJson | null>(null);
  const [liveStatus, setLiveStatus] = useState<ClipStatus>(props.status);
  const [liveTitle, setLiveTitle] = useState(props.title);
  const [livePalette, setLivePalette] = useState(props.palette);
  const [liveAudioUrl, setLiveAudioUrl] = useState(props.audioUrl);
  const [livePeaksUrl, setLivePeaksUrl] = useState(props.peaksUrl);
  const [liveSpecUrl, setLiveSpecUrl] = useState(props.spectrogramUrl);

  // Fetch peaks JSON when available
  useEffect(() => {
    if (!livePeaksUrl) return;
    let cancelled = false;
    fetch(livePeaksUrl)
      .then((r) => r.json())
      .then((json: PeaksJson) => {
        if (!cancelled) setPeaks(json);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [livePeaksUrl]);

  // SSE: live-swap waveform once worker finishes
  useEffect(() => {
    if (liveStatus === 'ready' || liveStatus === 'failed') return;
    const es = new EventSource(`/api/clips/${props.shareCode}/stream`);
    es.addEventListener('clip-update', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as {
          status: ClipStatus;
          title?: string | null;
          palette?: WaveformPalette | null;
          audioUrl?: string | null;
          peaksUrl?: string | null;
          spectrogramUrl?: string | null;
        };
        if (data.status) setLiveStatus(data.status);
        if (typeof data.title !== 'undefined') setLiveTitle(data.title ?? null);
        if (typeof data.palette !== 'undefined') setLivePalette(data.palette ?? null);
        if (typeof data.audioUrl !== 'undefined') setLiveAudioUrl(data.audioUrl ?? null);
        if (typeof data.peaksUrl !== 'undefined') setLivePeaksUrl(data.peaksUrl ?? null);
        if (typeof data.spectrogramUrl !== 'undefined') setLiveSpecUrl(data.spectrogramUrl ?? null);
      } catch {
        // ignore malformed events
      }
    });
    es.addEventListener('error', () => es.close());
    return () => es.close();
  }, [props.shareCode, liveStatus]);

  const palette = livePalette ?? undefined;
  // shareUrl is computed server-side from PUBLIC_URL and passed in as a prop
  // so server and client render the same string (no hydration mismatch).
  const shareUrl = props.shareUrl;

  const accentStyle: CSSProperties | undefined = palette
    ? ({
        ['--clip-bass']: palette.bass,
        ['--clip-mid']: palette.mid,
        ['--clip-high']: palette.high,
        background: `radial-gradient(at 50% 0%, ${withAlpha(palette.mid, 0.08)} 0%, transparent 60%)`,
      } as CSSProperties)
    : undefined;

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6 py-12" style={accentStyle}>
      <header className="flex items-center justify-between">
        <Logo size={36} wordmark className="text-torus-fg" />
        <div className="flex items-center gap-2">
          <UploadButton variant="pill" label="upload (U)" />
          <AuthNav />
        </div>
      </header>

      <div className="mt-12 flex-1">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {liveTitle ?? <span className="opacity-40">untitled</span>}
        </h1>

        <p className="mt-3 text-sm text-torus-fg-dim">
          by{' '}
          {props.creatorHandle ? (
            <Link href={`/u/${props.creatorHandle}`} className="text-torus-mid hover:underline">
              @{props.creatorHandle}
            </Link>
          ) : (
            <span>{props.creatorLabel ?? 'Anonymous'}</span>
          )}
        </p>

        <div className="mt-8">
          {liveStatus === 'failed' ? (
            <FailedView error={props.statusError} />
          ) : (
            <ClipPlayer
              peaks={peaks ?? undefined}
              palette={palette}
              audioUrl={liveAudioUrl ?? undefined}
              spectrogramUrl={liveSpecUrl ?? undefined}
              durationSec={
                props.durationMs && props.durationMs > 0 ? props.durationMs / 1000 : undefined
              }
              height={180}
            />
          )}
        </div>

        <div className="mt-8 flex flex-col gap-4">
          <ShareCard shareUrl={shareUrl} title={props.title} />

          <div className="flex flex-wrap items-center gap-2 text-xs text-torus-fg-dim">
            {liveStatus === 'pending' || liveStatus === 'processing' ? <ProcessingTag /> : null}
            {liveStatus === 'ready' && props.allowDownload && liveAudioUrl ? (
              <a
                href={liveAudioUrl}
                download
                className="rounded-full border border-torus-border-strong px-3 py-1.5 hover:bg-torus-surface"
              >
                download
              </a>
            ) : null}
            <Link
              href={`/${props.shareCode}/report`}
              className="rounded-full px-3 py-1.5 text-torus-fg-faint hover:bg-torus-surface"
            >
              report
            </Link>
            <span aria-hidden className="ml-auto opacity-50" />
            <span className="font-mono opacity-60">{props.shareCode}</span>
          </div>
        </div>
      </div>

      <footer className="mt-12 pt-6 text-center text-xs text-torus-fg-faint">
        <Link href="/" className="hover:text-torus-fg">
          torus.fm
        </Link>{' '}
        · share the loop
      </footer>
    </main>
  );
}

function ProcessingTag() {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-torus-border-strong px-3 py-1.5"
      aria-live="polite"
    >
      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-torus-mid" />
      preparing waveform...
    </span>
  );
}

function FailedView({ error }: { error: string | null }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-torus-bass/40 bg-torus-bass/5 p-6 text-sm text-torus-bass"
    >
      Processing failed. {error ?? 'Unknown error.'}
    </div>
  );
}

function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const r = parseInt(m[1]!, 16);
  const g = parseInt(m[2]!, 16);
  const b = parseInt(m[3]!, 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
