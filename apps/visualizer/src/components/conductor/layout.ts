import { PPQ } from '@/lib/conductor/project';

/** Shared layout + snapping constants for the arrangement timeline. */
export const TRACK_HEADER_W = 208;
export const LANE_H = 64;
export const RULER_H = 28;
export const PX_PER_QUARTER = 36;
export const BEATS_PER_BAR = 4;

export const TICKS_PER_BAR = PPQ * BEATS_PER_BAR;
export const PX_PER_TICK = PX_PER_QUARTER / PPQ;

export function tickToPx(tick: number): number {
  return tick * PX_PER_TICK;
}

export function pxToTick(px: number): number {
  return px / PX_PER_TICK;
}

/** Snap a tick to the nearest grid division (default: one beat / quarter). */
export function snapTick(tick: number, division = PPQ): number {
  return Math.round(tick / division) * division;
}
