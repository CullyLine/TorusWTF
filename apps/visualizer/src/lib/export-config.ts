export type ExportResolution = '720p' | '1080p' | '1440p' | '4k';

export const RESOLUTION_SIZES: Record<ExportResolution, { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  '4k': { width: 3840, height: 2160 },
};

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

export function pickRecorderMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  for (const mime of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return 'video/webm';
}

export function fileExtensionForMime(mime: string): string {
  return mime.includes('mp4') ? 'mp4' : 'webm';
}
