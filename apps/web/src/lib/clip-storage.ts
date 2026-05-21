import 'server-only';
import type { Clip } from '@torus/db';
import { storage } from './storage';

type ClipStorageKeys = Pick<
  Clip,
  'originalKey' | 'opusKey' | 'peaksKey' | 'spectrogramKey' | 'ogImageKey'
>;

/** Best-effort delete of all object-storage keys for a clip. */
export async function deleteClipStorageKeys(clip: ClipStorageKeys): Promise<void> {
  const keys = [
    clip.originalKey,
    clip.opusKey,
    clip.peaksKey,
    clip.spectrogramKey,
    clip.ogImageKey,
  ].filter((k): k is string => Boolean(k));

  for (const key of keys) {
    try {
      await storage.deleteObject(key);
    } catch {
      // idempotent — missing keys are fine
    }
  }
}
