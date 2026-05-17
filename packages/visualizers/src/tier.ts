export type DeviceTier = 'high' | 'mid' | 'low';

/**
 * Quick runtime device tiering. Hand-wavy on purpose — we just need three
 * buckets to scale particle counts and toggle post-processing.
 *
 *   - high: desktop / high-DPR powerful GPU
 *   - mid:  most laptops, mid-range phones
 *   - low:  low-end mobile / no WebGL2
 *
 * Errs on the side of "mid" if it can't tell.
 */
export function detectTier(): DeviceTier {
  if (typeof window === 'undefined') return 'mid';

  // No WebGL? Definitely low.
  const canvas = document.createElement('canvas');
  const gl = (canvas.getContext('webgl2') ??
    canvas.getContext('webgl')) as WebGLRenderingContext | null;
  if (!gl) return 'low';

  const isMobile = /Mobi|Android/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const dpr = window.devicePixelRatio ?? 1;

  if (isMobile && (cores < 6 || mem < 4)) return 'low';
  if (isMobile) return 'mid';
  if (cores >= 8 && mem >= 8 && dpr >= 1) return 'high';
  return 'mid';
}
