'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useMetricsRef } from './metrics';
import { useModulation } from './modulation';
import type { VisualImpulses } from './impulse';

/**
 * Living palette — makes color itself a musical instrument.
 *
 * The user picks a base palette (three hex colors); this driver breathes
 * life into it every frame:
 *
 *  - a slow hue orbit (~±12°) that drifts at the music's pace, so long
 *    sessions never sit on one static color
 *  - mood warmth from `moodValence` + `tenderness` (EMA-smoothed): warm
 *    vocal passages drift amber and bloom in saturation; cool instrumental
 *    valleys drift cyan and lean leaner — color feels emotional, not only
 *    loudness-driven
 *  - gather cool: pre-beat `gather` eases hue toward cyan and leans
 *    saturation/light down a notch — color inhales before the hit
 *  - hit warm bloom: `impact`/`kick` push amber + sat/light up so the
 *    downbeat answers the gather cool (on top of mood warmth, not instead)
 *  - holdBreath hush: during a held quiet bar, cool mood warmth toward cyan
 *    and nearly freeze the hue crawl (beyond silence desat) so the shared
 *    palette listens with the creature; thaw restores warmth crawl promptly
 *  - leanIn cool anticipation: as tension climbs before a drop, tilt hue
 *    slightly cyan and tighten saturation (held-breath-before-the-drop),
 *    then release into the existing impact/kick warm bloom — distinct from
 *    gather's pre-beat inhale and hush's crawl freeze
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

/** Asymmetric EMA — rise/fall taus so hush freezes attentively and thaws promptly. */
function smoothToward(
  current: number,
  target: number,
  dt: number,
  riseTau: number,
  fallTau: number,
): number {
  const tau = target > current ? riseTau : fallTau;
  const k = 1 - Math.exp(-dt / Math.max(tau, 1e-4));
  return current + (target - current) * k;
}

export function LivingPaletteDriver({ base, out, amount = 0.6, impulses }: LivingPaletteDriverProps) {
  const metricsRef = useMetricsRef();
  const mods = useModulation();
  const huePhaseRef = useRef(Math.random());
  const hueKickRef = useRef(0);
  const kickSignRef = useRef(1);
  const prevDropRef = useRef(0);
  /** EMA of mood warmth (−1 cool … +1 warm) so hue never jumps with noisy valence. */
  const moodWarmthRef = useRef(0);
  /** Smoothed pre-beat gather — cool/desat inhale before the downbeat. */
  const gatherCoolRef = useRef(0);
  /** Smoothed impact+kick warmth — amber bloom that answers the gather. */
  const hitWarmRef = useRef(0);
  /** Smoothed holdBreath hush — cools warmth + slows hue crawl while listening. */
  const hushSmooth = useRef(0);
  /** Smoothed leanIn cool — cyan + sat tighten before the drop. */
  const leanCoolRef = useRef(0);

  useFrame((_state, delta) => {
    const life = clamp(mods.current.colorLife ?? amount, 0, 1);
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
      moodWarmthRef.current *= Math.exp(-dt / 0.6);
      gatherCoolRef.current *= Math.exp(-dt / 0.18);
      hitWarmRef.current *= Math.exp(-dt / 0.22);
      hushSmooth.current *= Math.exp(-dt / 0.2);
      leanCoolRef.current *= Math.exp(-dt / 0.2);
      if (out.bass !== base.bass) out.bass = base.bass;
      if (out.mid !== base.mid) out.mid = base.mid;
      if (out.high !== base.high) out.high = base.high;
      return;
    }

    const m = metricsRef.current;

    // Hold-breath hush: rise a touch slower than fall so the cool/crawl-freeze
    // feels attentive, not gated; thaw resumes promptly when music returns.
    const hushTarget = Math.min(
      1,
      Math.max(m.holdBreath, m.silence * 0.88) + Math.min(m.holdBreath, m.silence) * 0.12,
    );
    hushSmooth.current = smoothToward(hushSmooth.current, hushTarget, dt, 0.14, 0.08);
    const hush = hushSmooth.current;

    // Hue orbit advances with the music's presence — faster in loud
    // passages, near-still in silence. One full lap takes minutes.
    // Section level gates the pace so color moods linger through valleys
    // and evolve during peaks. Hush nearly freezes the crawl so the palette
    // listens with the creature (a whisper remains — never frozen-dead).
    const sectionPace = 0.6 + m.sectionLevel * 0.55;
    const crawlMul = 1 - hush * 0.9;
    huePhaseRef.current = wrap01(
      huePhaseRef.current +
        dt * (0.006 + m.swell * 0.016 + m.impact * 0.004) * sectionPace * crawlMul,
    );

    // Drop → kick the wheel, alternating direction so back-to-back drops
    // feel like call and answer instead of a ratchet. Scaled by life so
    // automatic kicks respect the Color life setting (manual ones don't).
    if (m.dropEvent > 0.85 && prevDropRef.current <= 0.85) {
      kickSignRef.current *= -1;
      hueKickRef.current = 0.08 * life * kickSignRef.current;
    }
    prevDropRef.current = m.dropEvent;

    // Mood warmth: long-EMA valence (confidence-gated) + tenderness, with a
    // gentle vocal lift so ballads amber-drift while cold techno cyan-drifts.
    // ~1.1s time constant keeps the cast continuous — never a hue pop.
    // Hush biases the target cool so a held quiet bar cools toward cyan
    // beyond silence desat alone; gather/hit phrase accents stay independent.
    const confidence = clamp(m.moodConfidence, 0, 1);
    const moodTarget = clamp(
      m.moodValence * (0.45 + 0.4 * confidence) +
        m.tenderness * 0.55 +
        m.vocalActivity * m.tenderness * 0.25 -
        // Cool instrumental valleys: low vocals + low tenderness + cool valence
        (1 - m.vocalActivity) * (1 - m.tenderness) * Math.max(0, -m.moodValence) * 0.2 -
        hush * 0.55,
      -1,
      1,
    );
    const moodAlpha = 1 - Math.exp(-dt / 1.1);
    moodWarmthRef.current += (moodTarget - moodWarmthRef.current) * moodAlpha;
    const warmth = moodWarmthRef.current;

    // Pre-beat gather cool + hit warm bloom. Quiet passages stay still:
    // gather is near-zero without BPM anticipation, and hit only rises on
    // real impact/kick — smoothed so micro-flux never flickers the cast.
    const gatherAlpha = 1 - Math.exp(-dt / 0.1);
    gatherCoolRef.current += (m.gather - gatherCoolRef.current) * gatherAlpha;
    const hitTarget = clamp(Math.max(m.impact * 0.85, m.kick * 0.95), 0, 1.2);
    const hitTau = hitTarget > hitWarmRef.current ? 0.045 : 0.16;
    hitWarmRef.current += (hitTarget - hitWarmRef.current) * (1 - Math.exp(-dt / hitTau));
    const gather = gatherCoolRef.current;
    const hit = hitWarmRef.current;
    // Gather → cyan (~−10°) + lean sat/light; hit → amber (~+11°) + bloom.
    // Hit deliberately overpowers residual gather so the downbeat reads warm.
    const phraseHue = life * (-gather * 0.028 + hit * 0.032);
    const phraseSat = life * (-gather * 0.11 + hit * 0.14);
    const phraseLight = life * (-gather * 0.07 + hit * 0.12);

    // LeanIn cool anticipation: tension climb before a drop. Rise eagerly,
    // fall a bit slower so the cool cast dissolves into the hit warm bloom
    // instead of snapping off. Hue cool + sat tighten only — no light dim
    // (gather already inhales light) and no crawl freeze (hush owns that).
    leanCoolRef.current = smoothToward(leanCoolRef.current, m.leanIn, dt, 0.08, 0.2);
    const lean = leanCoolRef.current;
    const leanHue = life * (-lean * 0.02);
    const leanSat = life * (-lean * 0.18);

    // Signed hue cast: + → amber (~+14°), − → cyan (~−14°). Independent of
    // the slow orbit and additive with drop kicks so drops still punch.
    // Extra hush cyan lean (~−8°) so quiet bars cool even when mood was warm.
    const moodHue = life * (warmth * 0.038 - hush * 0.022);
    // Warm passages bloom saturation; cool valleys lean a touch leaner.
    // Hush softens tenderness sat so the hush reads as cooler, not just dimmer.
    const moodSat = life * (warmth * 0.14 + m.tenderness * 0.06 * (1 - hush * 0.7));

    const drift = Math.sin(huePhaseRef.current * Math.PI * 2) * 0.034;
    const hueShift = life * drift + hueKickRef.current + moodHue + phraseHue + leanHue;
    // Afterglow holds saturation and light elevated for seconds after a
    // peak — the color equivalent of a room still ringing.
    const satBoost =
      1 +
      life * (m.swell * 0.22 + m.impact * 0.1 + m.afterglow * 0.16 - m.silence * 0.4) +
      moodSat +
      phraseSat +
      leanSat;
    const lightBoost =
      1 +
      life *
        (m.swell * 0.14 +
          m.impact * 0.18 +
          m.shimmer * 0.08 +
          m.afterglow * 0.08 -
          m.silence * 0.22 +
          // Soft warm lift — amber passages feel lit, not just tinted.
          Math.max(0, warmth) * 0.05) +
      phraseLight;

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
