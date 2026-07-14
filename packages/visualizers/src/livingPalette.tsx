'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useMetricsRef } from './metrics';
import type { VisualImpulses } from './impulse';

/**
 * Living palette — makes color itself a musical instrument.
 *
 * The user picks a base palette (three hex colors); this driver breathes
 * life into it every frame:
 *
 *  - a slow hue orbit (~±12°) that drifts at the music's pace, so long
 *    sessions never sit on one static color
 *  - saturation and brightness swell with loudness and land with beat
 *    impacts — choruses literally glow more vivid than verses
 *  - drops kick the whole palette a few degrees around the wheel
 *    (alternating direction) and it eases back over ~1.5s — a visible
 *    "the world changed" moment
 *  - silence gently desaturates toward rest
 *
 * Implementation note: `out` is a stable object identity shared as the
 * `palette` prop by every scene component. Presets already re-read
 * `palette.bass` etc. inside `useFrame`, so mutating the fields here makes
 * color live everywhere without re-rendering React each frame.
 */

export interface LivingPaletteTarget {
  bass: string;
  mid: string;
  high: string;
}

interface LivingPaletteDriverProps {
  /** The user's chosen base palette (source of truth). */
  base: { bass: string; mid: string; high: string };
  /** Mutable palette object consumed by the scene graph. */
  out: LivingPaletteTarget;
  /** 0 = colors stay exactly as picked; 1 = full breathing/drifting life. */
  amount?: number;
  /** One-shot commands from trigger mappings / MIDI (hueKick consumed here). */
  impulses?: VisualImpulses;
}

const scratchColor = new THREE.Color();
const scratchHSL = { h: 0, s: 0, l: 0 };

function wrap01(v: number): number {
  return v - Math.floor(v);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function LivingPaletteDriver({ base, out, amount = 0.6, impulses }: LivingPaletteDriverProps) {
  const metricsRef = useMetricsRef();
  const huePhaseRef = useRef(Math.random());
  const hueKickRef = useRef(0);
  const kickSignRef = useRef(1);
  const prevDropRef = useRef(0);

  useFrame((_state, delta) => {
    const life = clamp(amount, 0, 1);
    const dt = Math.min(delta, 0.1);

    // Manual color kick (trigger mapping / MIDI) — fires even at Color life
    // 0, because the user explicitly asked for it.
    if (impulses && impulses.hueKick > 0.001) {
      kickSignRef.current *= -1;
      hueKickRef.current = 0.1 * Math.min(1.5, impulses.hueKick) * kickSignRef.current;
      impulses.hueKick = 0;
    }
    hueKickRef.current *= Math.exp(-dt / 1.5);

    if (life <= 0.001 && Math.abs(hueKickRef.current) < 0.002) {
      if (out.bass !== base.bass) out.bass = base.bass;
      if (out.mid !== base.mid) out.mid = base.mid;
      if (out.high !== base.high) out.high = base.high;
      return;
    }

    const m = metricsRef.current;

    // Hue orbit advances with the music's presence — faster in loud
    // passages, near-still in silence. One full lap takes minutes.
    huePhaseRef.current = wrap01(
      huePhaseRef.current + dt * (0.006 + m.swell * 0.016 + m.impact * 0.004),
    );

    // Drop → kick the wheel, alternating direction so back-to-back drops
    // feel like call and answer instead of a ratchet. Scaled by life so
    // automatic kicks respect the Color life setting (manual ones don't).
    if (m.dropEvent > 0.85 && prevDropRef.current <= 0.85) {
      kickSignRef.current *= -1;
      hueKickRef.current = 0.08 * life * kickSignRef.current;
    }
    prevDropRef.current = m.dropEvent;

    const drift = Math.sin(huePhaseRef.current * Math.PI * 2) * 0.034;
    const hueShift = life * drift + hueKickRef.current;
    const satBoost = 1 + life * (m.swell * 0.22 + m.impact * 0.1 - m.silence * 0.4);
    const lightBoost =
      1 + life * (m.swell * 0.14 + m.impact * 0.18 + m.shimmer * 0.08 - m.silence * 0.22);

    applyLife(out, 'bass', base.bass, hueShift, satBoost, lightBoost * 0.96);
    applyLife(out, 'mid', base.mid, hueShift + life * 0.006, satBoost, lightBoost);
    // Highs shimmer a touch further around the wheel and catch the sparkle.
    applyLife(
      out,
      'high',
      base.high,
      hueShift + life * (0.012 + m.shimmer * 0.015),
      satBoost,
      lightBoost * (1 + m.shimmer * 0.1),
    );
  });

  return null;
}

function applyLife(
  out: LivingPaletteTarget,
  band: keyof LivingPaletteTarget,
  baseHex: string,
  hueShift: number,
  satBoost: number,
  lightBoost: number,
): void {
  scratchColor.set(baseHex);
  scratchColor.getHSL(scratchHSL);
  scratchColor.setHSL(
    wrap01(scratchHSL.h + hueShift),
    clamp(scratchHSL.s * satBoost, 0, 1),
    // Ceiling below pure white so bloom has color to bleed, not blowout.
    clamp(scratchHSL.l * lightBoost, 0.02, 0.86),
  );
  out[band] = `#${scratchColor.getHexString()}`;
}
