'use client';

import { useId } from 'react';
import type { CSSProperties } from 'react';

interface BrandMarkProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** Render the cosmic sparkle on the ring. Defaults to true. */
  sparkle?: boolean;
  title?: string;
}

/**
 * torus brand mark — a minimal but cosmic doughnut. A single bold ring with a
 * violet→cyan→magenta sweep and a small sparkle, poking at the fact that the
 * site mascot is, literally, a donut. Pure SVG so it scales and recolors
 * cleanly for the accordion toggle, favicon, and anywhere a logo is needed.
 */
export function BrandMark({
  size = 28,
  className,
  style,
  sparkle = true,
  title = 'torus',
}: BrandMarkProps) {
  const gid = useId();
  const ringId = `torus-ring-${gid}`;
  const glowId = `torus-glow-${gid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={className}
      style={{ display: 'block', flexShrink: 0, ...style }}
    >
      <defs>
        <linearGradient id={ringId} x1="5" y1="6" x2="27" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A855F7" />
          <stop offset="0.5" stopColor="#22D3CE" />
          <stop offset="1" stopColor="#FF2D95" />
        </linearGradient>
        <radialGradient id={glowId} cx="0.5" cy="0.5" r="0.5">
          <stop stopColor="#22D3CE" stopOpacity="0.35" />
          <stop offset="1" stopColor="#22D3CE" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16.5" r="11" fill={`url(#${glowId})`} />
      <circle cx="16" cy="16.5" r="9.25" stroke={`url(#${ringId})`} strokeWidth="4.5" />
      {sparkle ? (
        <path
          d="M25 4.5 L25.9 7.1 L28.5 8 L25.9 8.9 L25 11.5 L24.1 8.9 L21.5 8 L24.1 7.1 Z"
          fill="#F7E08C"
        />
      ) : null}
    </svg>
  );
}
