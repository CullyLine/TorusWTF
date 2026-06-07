/**
 * Object-key conventions for stored audio artifacts.
 * The same clip id leads to a tight family of objects we can list together.
 */
export const StorageKeys = {
  /** The original uploaded file, untransformed. Used for the optional "download original" feature. */
  original: (clipId: string, ext: string): string => `clips/${clipId}/original.${ext}`,

  /** The web-friendly Opus transcode. Always 96kbit Opus in an .ogg container. */
  opus: (clipId: string): string => `clips/${clipId}/audio.opus.ogg`,

  /** Compact JSON peaks + per-band energy used to render the 2D waveform. */
  peaks: (clipId: string): string => `clips/${clipId}/peaks.json`,

  /** Pre-rendered spectrogram PNG for the optional spectrogram view. */
  spectrogram: (clipId: string): string => `clips/${clipId}/spectrogram.png`,

  /** 1200x630 OpenGraph waveform preview PNG for social embeds. */
  ogImage: (clipId: string): string => `clips/${clipId}/og.png`,

  /** All keys under a clip id. Used at delete time. */
  clipPrefix: (clipId: string): string => `clips/${clipId}/`,

  /** User avatars. */
  avatar: (userId: string): string => `avatars/${userId}.webp`,

  // ---------- Lab (compute jobs) ----------

  /** Uploaded input for a Lab job. */
  labInput: (jobId: string, ext: string): string => `lab/${jobId}/input.${ext}`,

  /** A produced output artifact for a Lab job (e.g. a stem). */
  labOutput: (jobId: string, name: string, ext: string): string =>
    `lab/${jobId}/${name}.${ext}`,

  /** All keys under a Lab job. Used at cleanup/auto-delete time. */
  labPrefix: (jobId: string): string => `lab/${jobId}/`,
} as const;
