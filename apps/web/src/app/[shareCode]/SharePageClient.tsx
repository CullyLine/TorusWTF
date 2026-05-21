'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ShareCard } from '@torus/ui';
import { SiteHeader } from '@/components/SiteHeader';
import type { PeaksJson, WaveformPalette, ClipStatus } from '@torus/shared';
import { ClipPlayer } from '@/components/ClipPlayer';
import { VoteButton } from '@/components/VoteButton';
import { CommentsSection } from '@/components/CommentsSection';
import { EditClipDialog } from '@/components/EditClipDialog';
import {
  clipManageHeaders,
  addClaimToken,
  getClaimTokenForShareCode,
  removeClaimTokenForShareCode,
} from '@/lib/claim-tokens';

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
  initialVoteCount: number;
  initialHasVoted: boolean;
}

export function SharePageClient(props: SharePageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [peaks, setPeaks] = useState<PeaksJson | null>(null);
  const [liveStatus, setLiveStatus] = useState<ClipStatus>(props.status);
  const [liveTitle, setLiveTitle] = useState(props.title);
  const [liveAllowDownload, setLiveAllowDownload] = useState(props.allowDownload);
  const [livePalette, setLivePalette] = useState(props.palette);
  const [liveAudioUrl, setLiveAudioUrl] = useState(props.audioUrl);
  const [livePeaksUrl, setLivePeaksUrl] = useState(props.peaksUrl);
  const [liveSpecUrl, setLiveSpecUrl] = useState(props.spectrogramUrl);
  const [canManage, setCanManage] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    const claim = searchParams.get('claim');
    if (!claim) return;
    addClaimToken({ shareCode: props.shareCode, token: claim });
    const next = new URL(window.location.href);
    next.searchParams.delete('claim');
    router.replace(next.pathname + (next.search || ''));
  }, [props.shareCode, router, searchParams]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/clips/${props.shareCode}/manage`, {
          credentials: 'same-origin',
          headers: clipManageHeaders(props.shareCode),
        });
        if (cancelled) return;
        if (!res.ok) {
          setCanManage(false);
          return;
        }
        const data = (await res.json()) as { canManage?: boolean };
        setCanManage(Boolean(data.canManage));
      } catch {
        if (!cancelled) setCanManage(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.shareCode]);

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
          allowDownload?: boolean;
          palette?: WaveformPalette | null;
          audioUrl?: string | null;
          peaksUrl?: string | null;
          spectrogramUrl?: string | null;
        };
        if (data.status) setLiveStatus(data.status);
        if (typeof data.title !== 'undefined') setLiveTitle(data.title ?? null);
        if (typeof data.allowDownload !== 'undefined') setLiveAllowDownload(data.allowDownload);
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

  const handleDeleteClip = useCallback(async () => {
    if (
      !window.confirm(
        'Delete this clip permanently? The share link will stop working.',
      )
    ) {
      return;
    }
    const claimToken = getClaimTokenForShareCode(props.shareCode);
    const res = await fetch(`/api/clips/${props.shareCode}`, {
      method: 'DELETE',
      headers: {
        'content-type': 'application/json',
        ...clipManageHeaders(props.shareCode),
      },
      credentials: 'same-origin',
      body: JSON.stringify(claimToken ? { claimToken } : {}),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      window.alert(data.error ?? 'Could not delete clip.');
      return;
    }
    removeClaimTokenForShareCode(props.shareCode);
    router.push('/');
    router.refresh();
  }, [props.shareCode, router]);

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
      <SiteHeader logoSize={36} />

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
              shareCode={props.shareCode}
              peaks={peaks ?? undefined}
              palette={palette}
              audioUrl={liveAudioUrl ?? undefined}
              spectrogramUrl={liveSpecUrl ?? undefined}
              durationSec={
                props.durationMs && props.durationMs > 0 ? props.durationMs / 1000 : undefined
              }
              height={180}
              canManageClip={canManage}
              onEditDetails={canManage ? () => setEditOpen(true) : undefined}
              onDeleteClip={canManage ? () => void handleDeleteClip() : undefined}
            />
          )}
        </div>

        <div className="mt-8 flex flex-col gap-4">
          <ShareCard shareUrl={shareUrl} title={liveTitle} />

          <div className="flex flex-wrap items-center gap-2 text-xs text-torus-fg-dim">
            {liveStatus === 'pending' || liveStatus === 'processing' ? <ProcessingTag /> : null}
            {liveStatus === 'ready' && liveAllowDownload ? (
              <a
                href={`/api/clips/${props.shareCode}/download`}
                className="rounded-full border border-torus-border-strong px-3 py-1.5 hover:bg-torus-surface"
              >
                download
              </a>
            ) : null}
            <VoteButton
              shareCode={props.shareCode}
              initialCount={props.initialVoteCount}
              initialHasVoted={props.initialHasVoted}
            />
            <Link
              href={`/${props.shareCode}/report`}
              className="rounded-full px-3 py-1.5 text-torus-fg-faint hover:bg-torus-surface"
            >
              report
            </Link>
            <span aria-hidden className="ml-auto opacity-50" />
            <span className="font-mono opacity-60">{props.shareCode}</span>
          </div>

          <CommentsSection shareCode={props.shareCode} />
        </div>
      </div>

      <EditClipDialog
        open={editOpen}
        shareCode={props.shareCode}
        initialTitle={liveTitle}
        initialAllowDownload={liveAllowDownload}
        onClose={() => setEditOpen(false)}
        onSaved={({ title, allowDownload }) => {
          setLiveTitle(title);
          setLiveAllowDownload(allowDownload);
        }}
      />

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
