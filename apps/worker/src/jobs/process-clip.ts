import { eq } from 'drizzle-orm';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { getDb, clips } from '@torus/db';
import { createStorage, StorageKeys } from '@torus/storage';
import { ffprobe } from '../audio/ffprobe.js';
import { transcodeToOpus } from '../audio/transcode.js';
import { computePeaks } from '../audio/peaks.js';
import { renderSpectrogram } from '../audio/spectrogram.js';
import { renderOgImage } from '../images/og.js';
import { palettize, type Palette } from '../images/palette.js';

const db = getDb();
const storage = createStorage();

export interface ProcessResult {
  clipId: string;
  durationMs: number;
  opusBytes: number;
  peakCount: number;
}

/**
 * Full pipeline for a single uploaded clip:
 *   1. download the original from storage to a temp file
 *   2. ffprobe to validate + extract duration
 *   3. transcode to Opus (web-friendly, ~1/10 the bytes of WAV)
 *   4. compute waveform peaks + per-band energy (FFT)
 *   5. derive a 3-color palette from those band energies
 *   6. render spectrogram PNG (background) and OG preview PNG (social embeds)
 *   7. upload all artifacts to storage and mark clip ready
 *
 * Heavy work goes through ffmpeg + Node's WebAssembly DSP (no native deps beyond ffmpeg).
 */
export async function processClip(clipId: string): Promise<ProcessResult> {
  const [clip] = await db.select().from(clips).where(eq(clips.id, clipId)).limit(1);
  if (!clip) throw new Error(`clip ${clipId} not found`);
  if (!clip.originalKey) throw new Error(`clip ${clipId} has no original_key`);

  const work = await mkdtemp(join(tmpdir(), `torus-${clipId}-`));
  try {
    // --- 1. download original ---
    const originalPath = join(work, 'original');
    const downloadUrl = await storage.downloadPresignedUrl(clip.originalKey, 600);
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error(`fetch original failed: ${res.status} ${res.statusText}`);
    const originalBytes = Buffer.from(await res.arrayBuffer());
    await writeFile(originalPath, originalBytes);

    // --- 2. validate via ffprobe ---
    const probed = await ffprobe(originalPath);
    if (!probed.hasAudio) throw new Error('No audio stream in upload.');
    const durationMs = Math.round(probed.durationSec * 1000);

    const maxDuration = Number(process.env.UPLOAD_MAX_DURATION_MS ?? 1_800_000);
    if (durationMs > maxDuration) {
      throw new Error(`Clip duration ${(durationMs / 60_000).toFixed(1)}min exceeds limit.`);
    }

    // --- 3. opus transcode ---
    const opusPath = join(work, 'audio.opus.ogg');
    await transcodeToOpus(originalPath, opusPath, 96);
    const opusBytes = await readFile(opusPath);
    await storage.putObject(
      StorageKeys.opus(clipId),
      opusBytes,
      'audio/ogg',
      'public, max-age=31536000, immutable',
    );

    // --- 4. peaks + band-energy ---
    const peaks = await computePeaks(originalPath, { binMs: 50 });
    await storage.putObject(
      StorageKeys.peaks(clipId),
      Buffer.from(JSON.stringify(peaks)),
      'application/json',
      'public, max-age=31536000, immutable',
    );

    // --- 5. palette ---
    const palette: Palette = palettize(peaks);

    // --- 6. spectrogram + OG image ---
    const spectrogramPng = await renderSpectrogram(originalPath, { width: 1600, height: 400 });
    await storage.putObject(
      StorageKeys.spectrogram(clipId),
      spectrogramPng,
      'image/png',
      'public, max-age=31536000, immutable',
    );

    const ogPng = await renderOgImage({
      title: clip.title ?? 'untitled',
      peaks,
      palette,
      durationMs,
    });
    const ogPngBuf = await sharp(ogPng).png().toBuffer();
    await storage.putObject(
      StorageKeys.ogImage(clipId),
      ogPngBuf,
      'image/png',
      'public, max-age=31536000, immutable',
    );

    // --- 7. mark ready ---
    await db
      .update(clips)
      .set({
        status: 'ready',
        durationMs,
        opusKey: StorageKeys.opus(clipId),
        peaksKey: StorageKeys.peaks(clipId),
        spectrogramKey: StorageKeys.spectrogram(clipId),
        ogImageKey: StorageKeys.ogImage(clipId),
        waveformPalette: JSON.stringify(palette),
        statusError: null,
      })
      .where(eq(clips.id, clipId));

    return {
      clipId,
      durationMs,
      opusBytes: opusBytes.length,
      peakCount: peaks.bins.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(clips)
      .set({ status: 'failed', statusError: message.slice(0, 500) })
      .where(eq(clips.id, clipId));
    throw err;
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}
