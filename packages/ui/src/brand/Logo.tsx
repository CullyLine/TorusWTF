'use client';

import type { CSSProperties } from 'react';

interface LogoProps {
  size?: number;
  wordmark?: boolean;
  color?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Primary brand mark: a single-line torus ring in three-quarter perspective.
 * Matches `assets/torus-logo-1-minimal-ring-v2.png`. Pure SVG so it scales infinitely
 * and recolors at runtime (the dominant-band recolor trick during playback).
 */
export function Logo({
  size = 96,
  wordmark = false,
  color = 'currentColor',
  className,
  style,
}: LogoProps) {
  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: size * 0.12,
        ...style,
      }}
      aria-label="torus.fm"
    >
      <svg
        width={size}
        height={size * 0.65}
        viewBox="0 0 200 130"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <ellipse cx="100" cy="65" rx="90" ry="35" />
        <ellipse cx="100" cy="65" rx="35" ry="12" />
      </svg>
      {wordmark ? (
        <span
          style={{
            fontFamily: 'inherit',
            fontSize: size * 0.18,
            letterSpacing: '0.16em',
            color,
          }}
        >
          torus<span style={{ opacity: 0.55, fontSize: '0.7em', marginLeft: '0.2em' }}>.fm</span>
        </span>
      ) : null}
    </div>
  );
}
