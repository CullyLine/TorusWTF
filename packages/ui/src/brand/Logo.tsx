'use client';

import type { CSSProperties, ReactNode } from 'react';

interface LogoProps {
  size?: number;
  wordmark?: boolean;
  color?: string;
  className?: string;
  style?: CSSProperties;
  /** Link target; defaults to home. Pass `null` if an ancestor is already a link. */
  href?: string | null;
}

const VIEWBOX_W = 200;
const VIEWBOX_H = 130;

/**
 * Primary brand mark: a single-line torus ring in three-quarter perspective.
 * Pure SVG so it scales cleanly and recolors at runtime.
 */
export function Logo({
  size = 96,
  wordmark = false,
  color = 'currentColor',
  className,
  style,
  href = '/',
}: LogoProps) {
  const markHeight = Math.round(size * (VIEWBOX_H / VIEWBOX_W));

  const content: ReactNode = (
    <>
      <svg
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
        preserveAspectRatio="xMidYMid meet"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{
          display: 'block',
          width: size,
          height: markHeight,
          flexShrink: 0,
        }}
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
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
          }}
        >
          torus<span style={{ opacity: 0.55, fontSize: '0.7em', marginLeft: '0.2em' }}>.fm</span>
        </span>
      ) : null}
    </>
  );

  const boxStyle: CSSProperties = {
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: size * 0.12,
    ...style,
  };

  if (href == null) {
    return (
      <div className={className} style={boxStyle} aria-label="torus.fm">
        {content}
      </div>
    );
  }

  return (
    <a
      href={href}
      className={className}
      style={{
        ...boxStyle,
        textDecoration: 'none',
        color: 'inherit',
        cursor: 'pointer',
      }}
      aria-label="torus.fm home"
    >
      {content}
    </a>
  );
}
