export function takeSnapshot(
  canvas: HTMLCanvasElement,
  mime: string = 'image/png',
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to capture snapshot'));
      },
      mime,
    );
  });
}

/**
 * Capture a small JPEG data URL of the current frame, for saved-preset
 * thumbnails. The source canvas is cover-fit into a 16:9 box so the
 * thumbnail matches the preset grid cards without distortion.
 */
export function captureThumbnailDataUrl(
  canvas: HTMLCanvasElement,
  width = 256,
  height = 144,
): string {
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable for thumbnail');

  const srcW = canvas.width || width;
  const srcH = canvas.height || height;
  const scale = Math.max(width / srcW, height / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  const dx = (width - drawW) / 2;
  const dy = (height - drawH) / 2;

  ctx.fillStyle = '#0a0b1e';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(canvas, dx, dy, drawW, drawH);

  return out.toDataURL('image/jpeg', 0.72);
}

export function downloadSnapshot(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `torus-visualizer-snapshot-${Date.now()}.png`;
  anchor.click();
  URL.revokeObjectURL(url);
}
