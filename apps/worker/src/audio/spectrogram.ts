import ffmpeg from 'fluent-ffmpeg';
import { readFile, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';

interface SpectrogramOptions {
  width?: number;
  height?: number;
}

/**
 * Render a spectrogram PNG via ffmpeg's `showspectrumpic` filter.
 * Background is transparent so the share page can layer it under the
 * frequency-band-colored waveform with the brand palette.
 */
export async function renderSpectrogram(
  inputPath: string,
  opts: SpectrogramOptions = {},
): Promise<Buffer> {
  const width = opts.width ?? 1600;
  const height = opts.height ?? 400;
  const outPath = join(dirname(inputPath), 'spectrogram.png');

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .complexFilter([
        // mono + small DC removal, then spectrum picture
        `[0:a]aresample=44100,highpass=f=20,showspectrumpic=s=${width}x${height}:legend=disabled:color=intensity:scale=log[v]`,
      ])
      .outputOptions(['-map', '[v]', '-frames:v', '1', '-y'])
      .on('error', (err: Error) => reject(new Error(`spectrogram render failed: ${err.message}`)))
      .on('end', () => resolve())
      .save(outPath);
  });

  const buf = await readFile(outPath);
  await unlink(outPath).catch(() => undefined);
  return buf;
}
