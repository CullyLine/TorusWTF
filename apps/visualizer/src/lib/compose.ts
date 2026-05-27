/**
 * Composites the R3F WebGL canvas onto an offscreen 2D canvas each frame.
 * Optionally draws a corner watermark for free-tier exports.
 */

export interface CompositorHandle {
  canvas: HTMLCanvasElement;
  start: () => void;
  stop: () => void;
}

export function createCompositor(
  sourceCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  watermark: boolean,
): CompositorHandle {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create 2D compositing context.');

  let raf = 0;

  const draw = () => {
    ctx.drawImage(sourceCanvas, 0, 0, width, height);

    if (watermark) {
      drawWatermark(ctx, width, height);
    }

    raf = requestAnimationFrame(draw);
  };

  return {
    canvas,
    start: () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    },
    stop: () => {
      cancelAnimationFrame(raf);
    },
  };
}

function drawWatermark(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const fontSize = Math.max(12, Math.round(width * 0.022));
  const pad = Math.round(fontSize * 0.8);
  const text = 'torus.wtf';

  ctx.save();
  ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
  const metrics = ctx.measureText(text);
  const boxW = metrics.width + pad * 2;
  const boxH = fontSize + pad * 1.4;
  const x = width - boxW - pad;
  const y = height - boxH - pad;

  ctx.globalAlpha = 0.55;
  ctx.fillStyle = 'rgba(10, 11, 30, 0.72)';
  roundRect(ctx, x, y, boxW, boxH, 6);
  ctx.fill();

  ctx.globalAlpha = 0.7;
  ctx.fillStyle = '#f5f5fa';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + pad, y + boxH / 2);
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
