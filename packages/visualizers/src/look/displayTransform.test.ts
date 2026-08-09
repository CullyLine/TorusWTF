import { describe, expect, it } from 'vitest';
import {
  DISPLAY_TRANSFORM_GLSL,
  LOOK_EXPOSURE,
  acesFilmic,
  applyLook,
  neutralClamp,
  type Rgb,
} from './displayTransform';

/** Display-referred linear to an 8-bit sRGB code value, as the screen shows it. */
const to8Bit = (v: number): number => {
  const encoded = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, encoded)) * 255);
};

const luminance = (rgb: readonly number[]): number =>
  0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;

const saturation = (rgb: readonly number[]): number => {
  const max = Math.max(...rgb);
  const min = Math.min(...rgb);
  return max === 0 ? 0 : (max - min) / max;
};

const grey = (v: number): Rgb => [v, v, v];

/**
 * The curve this module replaced: a ratio-preserving soft knee from 0.82 with
 * an asymptote at 0.98. Kept here, in the tests only, as the baseline the new
 * behaviour is measured against.
 */
const legacyGuard = (rgb: Rgb): number[] => {
  const threshold = 0.82;
  const knee = 0.16;
  const peak = Math.max(0, ...rgb);
  if (peak <= threshold) return [...rgb];
  const excess = peak - threshold;
  const compressed = threshold + excess / (1 + excess / knee);
  return rgb.map((c) => c * (compressed / peak));
};

/** A saturated magenta, the kind of additive neon these presets emit. */
const neon = (k: number): Rgb => [1 * k, 0.08 * k, 0.6 * k];

describe('acesFilmic', () => {
  it('keeps climbing across the whole scene range', () => {
    // The defect this replaces: the old knee flattened out above ~2x, so
    // louder stopped looking louder. Every step here must gain brightness.
    const samples = [0.25, 0.5, 1, 2, 4, 8].map((v) => luminance(applyLook(grey(v))));
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!).toBeGreaterThan(samples[i - 1]!);
    }
  });

  it('reaches white for very bright scene values', () => {
    // The legacy knee asymptoted at 0.98, so no scene value could ever paint
    // a white pixel. This curve gets there at roughly 14x.
    expect(to8Bit(legacyGuard(grey(1e6))[0]!)).toBeLessThan(255);
    expect(to8Bit(applyLook(grey(14))[0])).toBe(255);
  });

  it('leaves the mid-tones where the legacy curve had them', () => {
    // Preset light levels were hand-tuned against the old response, so the
    // middle of the range has to survive the swap.
    for (const scene of [0.18, 0.3, 0.5]) {
      const legacy = to8Bit(legacyGuard(grey(scene))[0]!);
      const next = to8Bit(applyLook(grey(scene))[0]);
      expect(Math.abs(next - legacy)).toBeLessThanOrEqual(6);
    }
  });

  it('deepens the shadows the additive bloom was lifting', () => {
    const legacy = to8Bit(legacyGuard(grey(0.02))[0]!);
    expect(to8Bit(applyLook(grey(0.02))[0])).toBeLessThan(legacy);
  });

  it('desaturates neon toward white as it gets brighter', () => {
    // How the eye reads "this is a light source" rather than "this is paint".
    const levels = [1, 2, 4, 10, 40].map((k) => saturation(applyLook(neon(k))));
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]!).toBeLessThan(levels[i - 1]!);
    }
    expect(levels.at(-1)!).toBeLessThan(0.1);
  });

  it('holds hue steady through the ordinary range', () => {
    const hueOf = (rgb: readonly number[]): number => {
      const [r, g, b] = rgb as [number, number, number];
      const max = Math.max(r, g, b);
      const delta = max - Math.min(r, g, b);
      if (delta === 0) return 0;
      const h = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
      return ((h * 60) % 360 + 360) % 360;
    };
    const base = hueOf(applyLook(neon(0.5)));
    expect(Math.abs(hueOf(applyLook(neon(2))) - base)).toBeLessThan(8);
  });

  it('never leaves the displayable range', () => {
    for (const scene of [0, 0.001, 1, 50, 1e6]) {
      for (const channel of acesFilmic(grey(scene))) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
  });

  it('survives non-finite and negative input', () => {
    const out = acesFilmic([Number.NaN, Number.POSITIVE_INFINITY, -5]);
    for (const channel of out) {
      expect(Number.isFinite(channel)).toBe(true);
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
  });
});

describe('applyLook', () => {
  it('scales scene light by the user level and the anchor exposure', () => {
    expect(applyLook(grey(0.2), { exposure: 2, filmic: true })).toEqual(
      acesFilmic(grey(0.2 * 2 * LOOK_EXPOSURE)),
    );
  });

  it('renders a black scene black', () => {
    expect(applyLook(grey(0))).toEqual([0, 0, 0]);
  });

  it('falls back to the neutral clamp when the filmic shoulder is off', () => {
    const scene = grey(3);
    expect(applyLook(scene, { exposure: 1, filmic: false })).toEqual(
      neutralClamp(grey(3 * LOOK_EXPOSURE)),
    );
  });
});

describe('neutralClamp', () => {
  it('preserves channel ratios while bounding the peak', () => {
    const [r, g, b] = neutralClamp([4, 2, 1]);
    expect(Math.max(r, g, b)).toBeCloseTo(1, 6);
    expect(g / r).toBeCloseTo(0.5, 6);
    expect(b / r).toBeCloseTo(0.25, 6);
  });

  it('passes through anything already displayable', () => {
    expect(neutralClamp([0.4, 0.2, 0.1])).toEqual([0.4, 0.2, 0.1]);
  });
});

describe('DISPLAY_TRANSFORM_GLSL', () => {
  it('exposes the entry points the effect shader calls', () => {
    expect(DISPLAY_TRANSFORM_GLSL).toContain('vec3 torusAcesFilmic(vec3 color)');
    expect(DISPLAY_TRANSFORM_GLSL).toContain('vec3 torusNeutralClamp(vec3 color)');
  });

  it('carries the same matrix constants as the CPU reference', () => {
    // The GLSL literals are transposed for column-major mat3, so check that
    // every coefficient is present rather than the layout.
    for (const coefficient of ['0.59719', '0.35458', '0.04823', '1.60475', '-0.53108', '1.07602']) {
      expect(DISPLAY_TRANSFORM_GLSL).toContain(coefficient);
    }
    for (const coefficient of ['0.0245786', '0.000090537', '0.983729', '0.432951', '0.238081']) {
      expect(DISPLAY_TRANSFORM_GLSL).toContain(coefficient);
    }
  });
});
