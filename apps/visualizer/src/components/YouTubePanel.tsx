'use client';

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function parseYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (VIDEO_ID_RE.test(trimmed)) {
    return trimmed;
  }

  let urlStr = trimmed;
  if (!/^https?:\/\//i.test(urlStr)) {
    urlStr = `https://${urlStr}`;
  }

  try {
    const url = new URL(urlStr);
    const hostname = url.hostname.replace(/^www\./i, '');

    if (hostname === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0];
      return id && VIDEO_ID_RE.test(id) ? id : null;
    }

    if (hostname === 'youtube.com' || hostname === 'music.youtube.com') {
      const v = url.searchParams.get('v');
      if (v && VIDEO_ID_RE.test(v)) return v;

      const pathMatch = url.pathname.match(/^\/(shorts|embed|v)\/([A-Za-z0-9_-]{11})/);
      if (pathMatch && VIDEO_ID_RE.test(pathMatch[2]!)) return pathMatch[2]!;

      return null;
    }

    return null;
  } catch {
    return null;
  }
}

export interface YouTubePanelProps {
  videoId: string;
  capturing: boolean;
  error: string | null;
  onCapture: () => void;
  onStopCapture: () => void;
  onClose: () => void;
}

/**
 * Floating mini-player. Lives at the app root (not the sidebar) so the
 * embed keeps playing when the sidebar hides in immersive mode. The URL
 * form lives in AudioSourcePicker — this panel only hosts the embed and
 * the capture controls.
 */
export function YouTubePanel({
  videoId,
  capturing,
  error,
  onCapture,
  onStopCapture,
  onClose,
}: YouTubePanelProps) {
  return (
    <div
      role="dialog"
      aria-label="YouTube player"
      className="fixed bottom-4 right-4 z-40 w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-torus-border-strong bg-torus-bg/95 p-4 shadow-2xl backdrop-blur"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-torus-fg-dim">YouTube</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close YouTube player"
          className="text-lg leading-none text-torus-fg-dim hover:text-torus-fg"
        >
          ×
        </button>
      </div>

      <div className="space-y-3">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1`}
          title="YouTube player"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          className="aspect-video w-full rounded-lg border border-torus-border"
        />

        {capturing ? (
          <div className="space-y-1">
            <p className="text-xs text-torus-mid">Capturing this tab{'\u2019'}s audio.</p>
            <button
              type="button"
              onClick={onStopCapture}
              className="text-xs text-torus-fg-dim hover:text-torus-bass"
            >
              Stop capturing
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={onCapture}
              className="rounded-full bg-torus-mid px-4 py-2 text-xs font-medium text-torus-bg"
            >
              Capture audio
            </button>
            <p className="text-[10px] text-torus-fg-faint">
              In the share dialog, pick &quot;This Tab&quot; and keep &quot;Also share tab
              audio&quot; on.
            </p>
          </div>
        )}
      </div>

      {error ? <p className="mt-2 text-xs text-torus-bass">{error}</p> : null}
    </div>
  );
}
