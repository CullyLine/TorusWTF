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
  /** Accent color for the .wtf tail. Defaults to torus-bass magenta. */
  accentColor?: string;
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
  accentColor = '#FF2D95',
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
            display: 'inline-flex',
            alignItems: 'baseline',
            gap: '0.05em',
          }}
        >
          torus
          <span
            style={{
              color: accentColor,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textShadow: `0 0 8px ${accentColor}40`,
            }}
          >
            .wtf
          </span>
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
      <div className={className} style={boxStyle} aria-label="torus.wtf">
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
      aria-label="torus.wtf home"
    >
      {content}
    </a>
  );
}
