'use client';

import { Button } from '@/components/ui/controls';

interface EmptyStateProps {
  onTryDemo: () => void;
  onChooseFile: () => void;
  demoLoading: boolean;
  reducedMotion: boolean;
}

// Circumferences of the two ellipses, used to draw them in with a dash offset.
const OUTER_LENGTH = 580;
const INNER_LENGTH = 220;

const STEPS = [
  { tab: 'Audio', text: 'Pick where the sound comes from.' },
  { tab: 'Look', text: 'Choose a visualizer and tune it.' },
  { tab: 'Export', text: 'Render or record the video.' },
] as const;

/** What the stage shows before any audio is loaded: what torus does and how to start. */
export function EmptyState({
  onTryDemo,
  onChooseFile,
  demoLoading,
  reducedMotion,
}: EmptyStateProps) {
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-6 md:p-10">
      <div className="grid w-full max-w-3xl items-center gap-10 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-torus-fg md:text-3xl">
            Turn audio into 3D visuals
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-torus-fg-dim">
            Play a track, use your mic, or capture the sound of another app. Shape the look, then
            export video up to 4K. It is free and needs no account.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="primary" disabled={demoLoading} onClick={onTryDemo}>
              {demoLoading ? 'Loading the demo track' : 'Play the demo track'}
            </Button>
            <Button onClick={onChooseFile}>Choose an audio file</Button>
          </div>
          <p className="mt-3 text-xs text-torus-fg-faint">
            You can also drop a file anywhere on this page.
          </p>

          <ol className="mt-8 space-y-1.5 border-t border-torus-border pt-5 text-[13px] text-torus-fg-dim">
            {STEPS.map((step, index) => (
              <li key={step.tab} className="flex gap-3">
                <span className="w-4 shrink-0 tabular-nums text-torus-fg-faint">{index + 1}</span>
                <span>
                  <span className="font-medium text-torus-fg">{step.tab}.</span> {step.text}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <TorusRings animate={!reducedMotion} />
      </div>
    </div>
  );
}

/** The torus mark as two ellipses that draw themselves in and out. */
function TorusRings({ animate }: { animate: boolean }) {
  return (
    <>
      {animate ? (
        <style>{`
          @keyframes torus-draw-outer {
            0%, 100% { stroke-dashoffset: ${OUTER_LENGTH}; opacity: 0.35; }
            8% { opacity: 1; }
            42%, 58% { stroke-dashoffset: 0; opacity: 1; }
            92% { opacity: 0.35; }
          }
          @keyframes torus-draw-inner {
            0%, 18%, 100% { stroke-dashoffset: ${INNER_LENGTH}; opacity: 0.25; }
            48%, 62% { stroke-dashoffset: 0; opacity: 1; }
            88% { opacity: 0.25; }
          }
          .torus-ring-outer {
            stroke-dasharray: ${OUTER_LENGTH};
            animation: torus-draw-outer 6s ease-in-out infinite;
          }
          .torus-ring-inner {
            stroke-dasharray: ${INNER_LENGTH};
            animation: torus-draw-inner 6s ease-in-out infinite;
          }
        `}</style>
      ) : null}
      <svg
        viewBox="0 0 200 130"
        className="hidden w-full max-w-xs justify-self-end md:block"
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
        />
        <ellipse
          className={animate ? 'torus-ring-inner' : undefined}
          cx="100"
          cy="65"
          rx="35"
          ry="12"
        />
      </svg>
    </>
  );
}
