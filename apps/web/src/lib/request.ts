/** Extract the originating client IP from a Next.js Request, honoring proxy headers. */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? '0.0.0.0';
}

const ALLOWED_AUDIO_MIME = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/flac',
  'audio/x-flac',
  'audio/aiff',
  'audio/x-aiff',
  'audio/ogg',
  'audio/opus',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/webm',
]);

const EXT_FROM_MIME: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/aiff': 'aiff',
  'audio/x-aiff': 'aiff',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/webm': 'webm',
};

export function isAllowedAudioMime(mime: string): boolean {
  return ALLOWED_AUDIO_MIME.has(mime.toLowerCase());
}

export function extFromMime(mime: string, fallback = 'bin'): string {
  return EXT_FROM_MIME[mime.toLowerCase()] ?? fallback;
}
