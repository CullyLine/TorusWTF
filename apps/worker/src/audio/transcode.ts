import ffmpeg from 'fluent-ffmpeg';

/**
 * Transcode any audio file into a web-friendly Opus stream in an Ogg container.
 * 96kbit/s is the sweet spot for music — Opus at 96k is widely regarded as
 * transparent on most material and roughly 1/15th the bytes of 16-bit WAV.
 */
export function transcodeToOpus(
  inputPath: string,
  outputPath: string,
  bitrateKbps = 96,
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec('libopus')
      .audioBitrate(`${bitrateKbps}k`)
      .audioChannels(2)
      .audioFrequency(48000)
      .outputOptions([
        '-vbr',
        'on',
        '-compression_level',
        '10',
        '-application',
        'audio',
        '-f',
        'ogg',
      ])
      .on('error', (err: Error) =>
        reject(new Error(`ffmpeg opus transcode failed: ${err.message}`)),
      )
      .on('end', () => resolve())
      .save(outputPath);
  });
}
