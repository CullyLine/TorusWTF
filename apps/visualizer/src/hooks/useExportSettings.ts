'use client';

import { useCallback } from 'react';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useToast } from '@/hooks/useToast';
import {
  ASPECT_OPTIONS,
  DEFAULT_EXPORT_FPS,
  DEFAULT_EXPORT_RESOLUTION,
  EXPORT_FPS_OPTIONS,
  EXPORT_RESOLUTIONS,
  dimensionsFor,
  type AspectRatio,
  type ExportFps,
  type ExportResolution,
} from '@/lib/export-config';
import {
  DEFAULT_WATERMARK_SETTINGS,
  EXPORT_ASPECT_KEY,
  EXPORT_FPS_KEY,
  EXPORT_RESOLUTION_KEY,
  WATERMARK_KEY,
  type WatermarkSettings,
} from '@/lib/storage';
import { fileToWatermarkDataUrl, watermarkDataUrlToBitmap } from '@/lib/watermarkImage';

const ASPECT_RATIOS: readonly AspectRatio[] = ASPECT_OPTIONS.map((option) => option.id);

/** The export format and watermark choices. They persist in `localStorage`. */
export function useExportSettings() {
  const { toast } = useToast();

  const [resolution, setResolution] = usePersistedState<ExportResolution>(
    EXPORT_RESOLUTION_KEY,
    DEFAULT_EXPORT_RESOLUTION,
    (value) =>
      EXPORT_RESOLUTIONS.includes(value as ExportResolution)
        ? (value as ExportResolution)
        : undefined,
  );
  const [fps, setFps] = usePersistedState<ExportFps>(EXPORT_FPS_KEY, DEFAULT_EXPORT_FPS, (value) =>
    EXPORT_FPS_OPTIONS.includes(value as ExportFps) ? (value as ExportFps) : undefined,
  );
  const [aspect, setAspect] = usePersistedState<AspectRatio>(EXPORT_ASPECT_KEY, '16:9', (value) =>
    ASPECT_RATIOS.includes(value as AspectRatio) ? (value as AspectRatio) : undefined,
  );
  const [watermark, setWatermark] = usePersistedState<WatermarkSettings>(
    WATERMARK_KEY,
    DEFAULT_WATERMARK_SETTINGS,
  );

  const setWatermarkShown = useCallback(
    (show: boolean) => setWatermark((current) => ({ ...current, show })),
    [setWatermark],
  );

  const setWatermarkImageFromFile = useCallback(
    async (file: File) => {
      try {
        const customImageDataUrl = await fileToWatermarkDataUrl(file);
        setWatermark((current) => ({ ...current, customImageDataUrl }));
      } catch {
        toast({ message: 'Could not read that image', variant: 'error' });
      }
    },
    [setWatermark, toast],
  );

  const resetWatermarkImage = useCallback(
    () => setWatermark((current) => ({ ...current, customImageDataUrl: null })),
    [setWatermark],
  );

  /** Decodes the custom logo for drawing, or resolves to null for the default badge. */
  const loadWatermarkBitmap = useCallback(
    async (): Promise<ImageBitmap | null> =>
      watermark.customImageDataUrl ? watermarkDataUrlToBitmap(watermark.customImageDataUrl) : null,
    [watermark.customImageDataUrl],
  );

  return {
    resolution,
    fps,
    aspect,
    watermark,
    /** Pixel size of an export at the current resolution and aspect ratio. */
    size: dimensionsFor(resolution, aspect),
    setResolution,
    setFps,
    setAspect,
    setWatermarkShown,
    setWatermarkImageFromFile,
    resetWatermarkImage,
    loadWatermarkBitmap,
  };
}

export type ExportSettings = ReturnType<typeof useExportSettings>;
