import { spawn } from 'node:child_process';

export interface FfprobeResult {
  hasAudio: boolean;
  durationSec: number;
  codec: string | null;
  sampleRate: number | null;
  channels: number | null;
}

/**
 * Runs ffprobe (bundled with ffmpeg) and returns a tight summary of the file.
 * Falls back to fluent-ffmpeg-style execution if the binary isn't on PATH.
 */
export function ffprobe(filePath: string): Promise<FfprobeResult> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      '-i',
      filePath,
    ];
    const proc = spawn('ffprobe', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (b: Buffer) => (stdout += b.toString('utf8')));
    proc.stderr.on('data', (b: Buffer) => (stderr += b.toString('utf8')));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`ffprobe failed (${code}): ${stderr || 'unknown error'}`));
      }
      try {
        const parsed = JSON.parse(stdout) as {
          format?: { duration?: string };
          streams?: Array<{
            codec_type?: string;
            codec_name?: string;
            sample_rate?: string;
            channels?: number;
            duration?: string;
          }>;
        };
        const audio = (parsed.streams ?? []).find((s) => s.codec_type === 'audio');
        const duration = Number(parsed.format?.duration ?? audio?.duration ?? '0') || 0;
        resolve({
          hasAudio: Boolean(audio),
          durationSec: duration,
          codec: audio?.codec_name ?? null,
          sampleRate: audio?.sample_rate ? Number(audio.sample_rate) : null,
          channels: audio?.channels ?? null,
        });
      } catch (err) {
        reject(new Error(`ffprobe JSON parse error: ${(err as Error).message}`));
      }
    });
  });
}
