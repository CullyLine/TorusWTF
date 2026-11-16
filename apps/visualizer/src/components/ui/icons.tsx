import type { SVGProps } from 'react';

/**
 * The few icons the studio needs, drawn on a 16px grid from basic shapes.
 * They inherit the text color and are hidden from assistive technology, so
 * every button that uses one needs its own accessible name.
 */

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...rest }: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Icon fill="currentColor" stroke="none" {...props}>
      <path d="M4.5 2.5v11l9-5.5z" />
    </Icon>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <Icon fill="currentColor" stroke="none" {...props}>
      <rect x="3.5" y="2.5" width="3" height="11" rx="0.75" />
      <rect x="9.5" y="2.5" width="3" height="11" rx="0.75" />
    </Icon>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <Icon fill="currentColor" stroke="none" {...props}>
      <rect x="3.5" y="3.5" width="9" height="9" rx="1" />
    </Icon>
  );
}

/** Back to the start: a bar with a triangle pointing at it. */
export function SkipBackIcon(props: IconProps) {
  return (
    <Icon fill="currentColor" stroke="none" {...props}>
      <rect x="3" y="3" width="2" height="10" rx="0.75" />
      <path d="M13 3v10L6 8z" />
    </Icon>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <Icon fill="currentColor" stroke="none" {...props}>
      <circle cx="3.5" cy="8" r="1.25" />
      <circle cx="8" cy="8" r="1.25" />
      <circle cx="12.5" cy="8" r="1.25" />
    </Icon>
  );
}

export function VolumeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 6.25h2.25L8 3.5v9L4.75 9.75H2.5z" fill="currentColor" stroke="none" />
      <path d="M10.5 5.75a3.2 3.2 0 0 1 0 4.5M12.4 3.9a5.8 5.8 0 0 1 0 8.2" />
    </Icon>
  );
}

export function MutedIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 6.25h2.25L8 3.5v9L4.75 9.75H2.5z" fill="currentColor" stroke="none" />
      <path d="M10.75 6.25l3 3.5M13.75 6.25l-3 3.5" />
    </Icon>
  );
}

export function FullscreenIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
    </Icon>
  );
}

/** Points right. Rotate it for other directions. */
export function ChevronIcon(props: IconProps) {
  return (
    <Icon width="12" height="12" {...props}>
      <path d="M6 3.5l4.5 4.5L6 12.5" />
    </Icon>
  );
}

/** A panel docked to the left edge, for the show and hide sidebar button. */
export function SidebarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M6.25 3v10" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Icon>
  );
}
