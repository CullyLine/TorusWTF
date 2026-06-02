import { describe, expect, it } from 'vitest';
import { bandWeightsAtHz, extractBands, type BandConfig } from './bands';

const CONFIG: BandConfig = { bassMaxHz: 250, midMaxHz: 2000 };

describe('bandWeightsAtHz', () => {
  it('sums to 1 across the whole spectrum (partition of unity)', () => {
    for (let f = 0; f <= 22050; f += 37) {
      const w = bandWeightsAtHz(f, CONFIG);
      expect(w.bass + w.mid + w.high).toBeCloseTo(1, 6);
      expect(w.bass).toBeGreaterThanOrEqual(0);
      expect(w.mid).toBeGreaterThanOrEqual(0);
      expect(w.high).toBeGreaterThanOrEqual(0);
    }
  });

  it('is continuous across the bass/mid crossover (no teleporting energy)', () => {
    let prev = bandWeightsAtHz(0, CONFIG);
    for (let f = 1; f <= 4000; f += 1) {
      const w = bandWeightsAtHz(f, CONFIG);
      // No single-Hz step should jump more than a small epsilon.
      expect(Math.abs(w.bass - prev.bass)).toBeLessThan(0.01);
      expect(Math.abs(w.mid - prev.mid)).toBeLessThan(0.01);
      expect(Math.abs(w.high - prev.high)).toBeLessThan(0.01);
      prev = w;
    }
  });

  it('is bass-dominant well below bassMaxHz and high-dominant well above midMaxHz', () => {
    const low = bandWeightsAtHz(40, CONFIG);
    expect(low.bass).toBeGreaterThan(0.95);
    const top = bandWeightsAtHz(12000, CONFIG);
    expect(top.high).toBeGreaterThan(0.95);
  });

  it('hard-cut mode (crossoverWidth 0) still partitions cleanly', () => {
    const cfg: BandConfig = { ...CONFIG, crossoverWidth: 0 };
    const w = bandWeightsAtHz(1000, cfg);
    expect(w.bass + w.mid + w.high).toBeCloseTo(1, 6);
    expect(w.mid).toBeCloseTo(1, 6);
  });
});

describe('extractBands', () => {
  const sampleRate = 44100;

  function buffer(fill: (binHz: number) => number, bins = 512): Uint8Array {
    const buf = new Uint8Array(bins);
    const binWidth = sampleRate / 2 / bins;
    for (let i = 0; i < bins; i++) buf[i] = Math.round(fill((i + 0.5) * binWidth));
    return buf;
  }

  it('puts low-frequency energy mostly in the bass band', () => {
    const buf = buffer((hz) => (hz < 150 ? 255 : 0));
    const out = extractBands(buf, 512, sampleRate, CONFIG);
    expect(out.bass).toBeGreaterThan(out.mid);
    expect(out.bass).toBeGreaterThan(out.high);
  });

  it('puts high-frequency energy mostly in the high band', () => {
    const buf = buffer((hz) => (hz > 6000 ? 255 : 0));
    const out = extractBands(buf, 512, sampleRate, CONFIG);
    expect(out.high).toBeGreaterThan(out.bass);
    expect(out.high).toBeGreaterThan(out.mid);
  });

  it('perceptual exponent < 1 lifts low-level detail above linear', () => {
    const buf = buffer(() => 64); // ~0.25 normalized everywhere
    const perceptual = extractBands(buf, 512, sampleRate, {
      ...CONFIG,
      perceptualExponent: 0.6,
    });
    const linear = extractBands(buf, 512, sampleRate, {
      ...CONFIG,
      perceptualExponent: 1,
    });
    expect(perceptual.full).toBeGreaterThan(linear.full);
  });

  it('returns zeros for an empty buffer', () => {
    const out = extractBands(new Uint8Array(0), 0, sampleRate, CONFIG);
    expect(out).toEqual({ bass: 0, mid: 0, high: 0, full: 0 });
  });

  it('keeps all bands within 0..1', () => {
    const buf = buffer(() => 255);
    const out = extractBands(buf, 512, sampleRate, CONFIG);
    for (const v of [out.bass, out.mid, out.high, out.full]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
