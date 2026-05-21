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

export function downloadSnapshot(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `torus-visualizer-snapshot-${Date.now()}.png`;
  anchor.click();
  URL.revokeObjectURL(url);
}
