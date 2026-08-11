export type ExportResolution = '720p' | '1080p' | '1440p' | '4k';

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5';

const RESOLUTION_HEIGHT: Record<ExportResolution, number> = {
  '720p': 720,
  '1080p': 1080,
  '1440p': 1440,
  '4k': 2160,
};

export const RESOLUTION_SIZES: Record<ExportResolution, { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  '4k': { width: 3840, height: 2160 },
};

export function dimensionsFor(
  res: ExportResolution,
  aspect: AspectRatio = '16:9',
): { width: number; height: number } {
  const base = RESOLUTION_HEIGHT[res];
  switch (aspect) {
    case '16:9':
      return { width: Math.round((base * 16) / 9), height: base };
    case '9:16':
      return { width: base, height: Math.round((base * 16) / 9) };
    case '1:1':
      return { width: base, height: base };
    case '4:5':
      return { width: base, height: Math.round((base * 5) / 4) };
  }
}

export const ASPECT_OPTIONS: { id: AspectRatio; label: string; icon: string }[] = [
  { id: '16:9', label: '16:9', icon: '▭' },
  { id: '9:16', label: '9:16', icon: '▯' },
  { id: '1:1', label: '1:1', icon: '□' },
  { id: '4:5', label: '4:5', icon: '▯' },
];

export type ExportFps = 30 | 60 | 120 | 240;

export const FREE_MAX_RES: ExportResolution = '720p';
export const FREE_MAX_FPS: ExportFps = 30;

export function isResolutionLocked(res: ExportResolution, unlocked: boolean): boolean {
  if (unlocked) return false;
  return res !== FREE_MAX_RES;
}

export function isFpsLocked(fps: ExportFps, unlocked: boolean): boolean {
  if (unlocked) return false;
  return fps > FREE_MAX_FPS;
}

export function bitrateFor(res: ExportResolution): number {
  switch (res) {
    case '720p':
      return 4_000_000;
    case '1080p':
      return 8_000_000;
    case '1440p':
      return 12_000_000;
    case '4k':
      return 20_000_000;
  }
}

/**
 * Returns null when the browser supports none of the candidates, so the
 * caller can say so instead of handing `MediaRecorder` a type it already
 * knows is unsupported and letting the constructor throw.
 */
export function pickRecorderMimeType(): string | null {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  if (typeof MediaRecorder === 'undefined') return null;
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

export function fileExtensionForMime(mime: string): string {
  return mime.includes('mp4') ? 'mp4' : 'webm';
}

/**
 * Live recording draws through a `requestAnimationFrame` compositor, so it
 * cannot produce more frames per second than the display refreshes —
 * `captureStream(fps)` is only a hint. Anything above this is honest only on
 * the offline pre-render path, which steps frames itself.
 */
export const MAX_REALTIME_FPS: ExportFps = 60;

export function isFpsRealtimeCapable(fps: ExportFps): boolean {
  return fps <= MAX_REALTIME_FPS;
}

/**
 * Largest square texture a resolution needs. Compared against the driver's
 * limit before a big export is attempted, because failing at allocation time
 * looks to the user like the export silently not working.
 */
export function exportExceedsGpuLimits(
  width: number,
  height: number,
  maxTextureSize: number,
): boolean {
  return Math.max(width, height) > maxTextureSize;
}
/**
 * Resolves once the WebGL canvas has actually reached the requested export
 * dimensions. React has to re-render and R3F has to resize the drawing
 * buffer, so starting the recorder in the same tick captures preview-sized
 * frames. Gives up after a few frames rather than blocking the export.
 */
export function waitForCanvasSize(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  timeoutMs = 1500,
): Promise<void> {
  return new Promise((resolve) => {
    const started = performance.now();
    const check = () => {
      const ready = canvas.width === width && canvas.height === height;
      if (ready || performance.now() - started > timeoutMs) {
        resolve();
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}
