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

// The Visualizer is fully free: nothing is ever locked.
export function isResolutionLocked(_res: ExportResolution, _unlocked: boolean): boolean {
  return false;
}

export function isFpsLocked(_fps: ExportFps, _unlocked: boolean): boolean {
  return false;
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
