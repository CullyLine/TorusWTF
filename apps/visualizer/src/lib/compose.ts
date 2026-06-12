/**
 * Composites the R3F WebGL canvas onto an offscreen 2D canvas each frame.
 * Optionally draws a corner watermark for free-tier exports and a
 * lower-third title overlay.
 */

import type { TitleOverlay } from '@/lib/storage';

export type WatermarkImage = ImageBitmap | HTMLImageElement;

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
  titleOverlay?: TitleOverlay | null,
  unlocked = false,
  watermarkImage: WatermarkImage | null = null,
): CompositorHandle {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create 2D compositing context.');

  let raf = 0;

  const draw = () => {
    ctx.drawImage(sourceCanvas, 0, 0, width, height);

    if (titleOverlay) {
      drawTitleOverlay(ctx, width, height, titleOverlay, unlocked);
    }

    if (watermark) {
      drawWatermark(ctx, width, height, watermarkImage);
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

export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  image?: WatermarkImage | null,
): void {
  if (image) {
    const pad = Math.round(width * 0.022 * 0.8);
    const targetW = Math.round(width * 0.12);
    const targetH = Math.round(image.height * (targetW / image.width));
    const x = width - targetW - pad;
    const y = height - targetH - pad;

    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.drawImage(image, x, y, targetW, targetH);
    ctx.restore();
    return;
  }

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

const BRAND_INDIGO = '13, 13, 35';

export function drawTitleOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  overlay: TitleOverlay,
  unlocked: boolean,
): void {
  const title = overlay.title.trim();
  const subtitle = overlay.subtitle.trim();
  if (!overlay.enabled || (!title && !subtitle)) return;

  // Free tier is clamped to brand defaults; paid unlocks customization.
  const position = unlocked ? overlay.position : 'bottom-left';
  const textColor = unlocked ? overlay.textColor : '#f5f5fa';
  const bgOpacity = unlocked ? Math.max(0, Math.min(1, overlay.bgOpacity)) : 0.55;

  const titleSize = Math.max(16, Math.round(width * 0.03));
  const subtitleSize = Math.round(titleSize * 0.62);
  const padX = Math.round(titleSize * 0.85);
  const padY = Math.round(titleSize * 0.6);
  const gap = subtitle ? Math.round(titleSize * 0.3) : 0;
  const margin = Math.round(width * 0.035);

  const titleFont = `600 ${titleSize}px Inter, system-ui, sans-serif`;
  const subtitleFont = `400 ${subtitleSize}px Inter, system-ui, sans-serif`;

  ctx.save();
  ctx.font = titleFont;
  const titleWidth = title ? ctx.measureText(title).width : 0;
  ctx.font = subtitleFont;
  const subtitleWidth = subtitle ? ctx.measureText(subtitle).width : 0;

  const contentWidth = Math.max(titleWidth, subtitleWidth);
  const contentHeight =
    (title ? titleSize : 0) + (subtitle ? subtitleSize : 0) + gap;
  const boxW = contentWidth + padX * 2;
  const boxH = contentHeight + padY * 2;

  const isBottom = position === 'bottom-left' || position === 'bottom-center';
  const x =
    position === 'bottom-center'
      ? Math.round((width - boxW) / 2)
      : position === 'top-right'
        ? width - boxW - margin
        : margin;
  const y = isBottom ? height - boxH - margin : margin;

  ctx.fillStyle = `rgba(${BRAND_INDIGO}, ${bgOpacity})`;
  roundRect(ctx, x, y, boxW, boxH, Math.round(titleSize * 0.35));
  ctx.fill();

  ctx.fillStyle = textColor;
  ctx.textBaseline = 'top';
  let cursorY = y + padY;
  if (title) {
    ctx.font = titleFont;
    ctx.fillText(title, x + padX, cursorY);
    cursorY += titleSize + gap;
  }
  if (subtitle) {
    ctx.globalAlpha = 0.85;
    ctx.font = subtitleFont;
    ctx.fillText(subtitle, x + padX, cursorY);
  }
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
