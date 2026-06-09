'use client';

interface EmptyStateHeroProps {
  reducedMotion: boolean;
  onTryDemo: () => void;
  demoLoading?: boolean;
}

const OUTER_LEN = 580;
const INNER_LEN = 220;

export function EmptyStateHero({ reducedMotion, onTryDemo, demoLoading = false }: EmptyStateHeroProps) {
  const animate = !reducedMotion;

  return (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center px-6 text-center">
      {animate ? (
        <style>{`
          @keyframes torus-draw-outer {
            0%, 100% { stroke-dashoffset: ${OUTER_LEN}; opacity: 0.35; }
            8% { opacity: 1; }
            42% { stroke-dashoffset: 0; opacity: 1; }
            58% { stroke-dashoffset: 0; opacity: 1; }
            92% { opacity: 0.35; }
          }
          @keyframes torus-draw-inner {
            0%, 100% { stroke-dashoffset: ${INNER_LEN}; opacity: 0.25; }
            18% { stroke-dashoffset: ${INNER_LEN}; opacity: 0.25; }
            48% { stroke-dashoffset: 0; opacity: 1; }
            62% { stroke-dashoffset: 0; opacity: 1; }
            88% { opacity: 0.25; }
          }
          .torus-ring-outer {
            stroke-dasharray: ${OUTER_LEN};
            animation: torus-draw-outer 6s ease-in-out infinite;
          }
          .torus-ring-inner {
            stroke-dasharray: ${INNER_LEN};
            animation: torus-draw-inner 6s ease-in-out infinite;
          }
        `}</style>
      ) : null}
      <svg
        viewBox="0 0 200 130"
        className="mb-6 h-28 w-44 sm:h-32 sm:w-52"
        fill="none"
        stroke="var(--color-torus-mid)"
        strokeWidth="1.5"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <ellipse
          className={animate ? 'torus-ring-outer' : undefined}
          cx="100"
          cy="65"
          rx="90"
          ry="35"
          strokeDasharray={animate ? undefined : OUTER_LEN}
          strokeDashoffset={animate ? undefined : 0}
        />
        <ellipse
          className={animate ? 'torus-ring-inner' : undefined}
          cx="100"
          cy="65"
          rx="35"
          ry="12"
          strokeDasharray={animate ? undefined : INNER_LEN}
          strokeDashoffset={animate ? undefined : 0}
        />
      </svg>
      <h1 className="text-lg font-semibold tracking-tight text-torus-fg">
        torus <span className="font-normal text-torus-fg-dim">— 3D visuals for your audio</span>
      </h1>
      <p className="mt-2 max-w-sm text-sm text-torus-fg-dim">
        Drop a track, talk into your mic, or capture desktop audio — then export the result for
        Reels, Shorts, or a release.
      </p>
      <button
        type="button"
        onClick={onTryDemo}
        disabled={demoLoading}
        className="mt-4 rounded-full border border-torus-mid/40 bg-torus-mid/10 px-4 py-2 text-xs font-medium text-torus-mid transition hover:border-torus-mid/60 hover:bg-torus-mid/15 disabled:opacity-60"
      >
        {demoLoading ? 'Loading demo\u2026' : 'Try with demo audio'}
      </button>
      <p className="mt-4 text-xs text-torus-fg-faint">
        Press <kbd className="rounded border border-torus-border px-1">?</kbd> anytime for keyboard
        shortcuts
      </p>
    </div>
  );
}
