import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_EXPORT_FPS,
  DEFAULT_EXPORT_RESOLUTION,
  EXPORT_FPS_OPTIONS,
  EXPORT_RESOLUTIONS,
  MAX_REALTIME_FPS,
  bitrateFor,
  dimensionsFor,
  exportExceedsGpuLimits,
  fileExtensionForMime,
  isFpsRealtimeCapable,
  pickRecorderMimeType,
} from './export-config';

const RESOLUTIONS = EXPORT_RESOLUTIONS;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('dimensionsFor', () => {
  it('produces even, positive dimensions for every resolution and aspect', () => {
    for (const res of RESOLUTIONS) {
      for (const aspect of ['16:9', '9:16', '1:1', '4:5'] as const) {
        const { width, height } = dimensionsFor(res, aspect);
        expect(width).toBeGreaterThan(0);
        expect(height).toBeGreaterThan(0);
        expect(Number.isInteger(width)).toBe(true);
        expect(Number.isInteger(height)).toBe(true);
      }
    }
  });

  it('orients portrait aspects taller than they are wide', () => {
    const portrait = dimensionsFor('1080p', '9:16');
    expect(portrait.height).toBeGreaterThan(portrait.width);
    const landscape = dimensionsFor('1080p', '16:9');
    expect(landscape.width).toBeGreaterThan(landscape.height);
  });
});

describe('export defaults', () => {
  it('starts on settings the pickers offer and live recording can produce', () => {
    expect(EXPORT_RESOLUTIONS).toContain(DEFAULT_EXPORT_RESOLUTION);
    expect(EXPORT_FPS_OPTIONS).toContain(DEFAULT_EXPORT_FPS);
    expect(isFpsRealtimeCapable(DEFAULT_EXPORT_FPS)).toBe(true);
  });
});

describe('isFpsRealtimeCapable', () => {
  it('admits that live recording cannot exceed the refresh rate', () => {
    // The compositor draws on requestAnimationFrame, so anything above this
    // is pre-render only.
    expect(isFpsRealtimeCapable(30)).toBe(true);
    expect(isFpsRealtimeCapable(MAX_REALTIME_FPS)).toBe(true);
    expect(isFpsRealtimeCapable(120)).toBe(false);
    expect(isFpsRealtimeCapable(240)).toBe(false);
  });
});

describe('pickRecorderMimeType', () => {
  it('returns the first supported candidate', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: (mime: string) => mime === 'video/webm;codecs=vp8,opus',
    });
    expect(pickRecorderMimeType()).toBe('video/webm;codecs=vp8,opus');
  });

  it('returns null rather than a type the browser rejected', () => {
    // Returning an unsupported string here made the MediaRecorder constructor
    // throw, which surfaced as a generic "could not start recording".
    vi.stubGlobal('MediaRecorder', { isTypeSupported: () => false });
    expect(pickRecorderMimeType()).toBeNull();
  });

  it('returns null when MediaRecorder is absent entirely', () => {
    vi.stubGlobal('MediaRecorder', undefined);
    expect(pickRecorderMimeType()).toBeNull();
  });
});

describe('exportExceedsGpuLimits', () => {
  it('flags an export larger than the driver can allocate', () => {
    const { width, height } = dimensionsFor('4k', '9:16');
    expect(exportExceedsGpuLimits(width, height, 2048)).toBe(true);
    expect(exportExceedsGpuLimits(width, height, 8192)).toBe(false);
  });
});

describe('bitrateFor and fileExtensionForMime', () => {
  it('raises bitrate with resolution', () => {
    const rates = RESOLUTIONS.map(bitrateFor);
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]!).toBeGreaterThan(rates[i - 1]!);
    }
  });

  it('names the file after the container actually used', () => {
    expect(fileExtensionForMime('video/mp4')).toBe('mp4');
    expect(fileExtensionForMime('video/webm;codecs=vp9,opus')).toBe('webm');
  });
});
