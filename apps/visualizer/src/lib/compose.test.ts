import { describe, expect, it } from 'vitest';
import { drawTitleOverlay } from './compose';
import { DEFAULT_TITLE_OVERLAY, type TitleOverlay } from './storage';

interface DrawnText {
  text: string;
  x: number;
  y: number;
}

function mockCtx() {
  const texts: DrawnText[] = [];
  const ctx = {
    font: '',
    fillStyle: '',
    textBaseline: '',
    globalAlpha: 1,
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    closePath() {},
    fill() {},
    measureText: (t: string) => ({ width: t.length * 10 }),
    fillText: (text: string, x: number, y: number) => texts.push({ text, x, y }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts };
}

const W = 1920;
const H = 1080;

describe('drawTitleOverlay', () => {
  it('draws nothing when disabled', () => {
    const { ctx, texts } = mockCtx();
    const overlay: TitleOverlay = { ...DEFAULT_TITLE_OVERLAY, title: 'Hi', enabled: false };
    drawTitleOverlay(ctx, W, H, overlay, true);
    expect(texts).toHaveLength(0);
  });

  it('draws nothing when title and subtitle are blank', () => {
    const { ctx, texts } = mockCtx();
    const overlay: TitleOverlay = { ...DEFAULT_TITLE_OVERLAY, enabled: true };
    drawTitleOverlay(ctx, W, H, overlay, true);
    expect(texts).toHaveLength(0);
  });

  it('renders title and subtitle text', () => {
    const { ctx, texts } = mockCtx();
    const overlay: TitleOverlay = {
      ...DEFAULT_TITLE_OVERLAY,
      enabled: true,
      title: 'Midnight Drive',
      subtitle: 'torus',
    };
    drawTitleOverlay(ctx, W, H, overlay, true);
    expect(texts.map((t) => t.text)).toEqual(['Midnight Drive', 'torus']);
  });

  it('clamps free tier to bottom-left regardless of saved position', () => {
    const { ctx, texts } = mockCtx();
    const overlay: TitleOverlay = {
      ...DEFAULT_TITLE_OVERLAY,
      enabled: true,
      title: 'X',
      position: 'top-right',
    };
    drawTitleOverlay(ctx, W, H, overlay, false);
    const margin = Math.round(W * 0.035);
    const padX = Math.round(Math.max(16, Math.round(W * 0.03)) * 0.85);
    // Left-anchored: x is the margin + horizontal padding, not pushed to the right edge.
    expect(texts[0]!.x).toBe(margin + padX);
    // Bottom-anchored: y sits in the lower half of the frame.
    expect(texts[0]!.y).toBeGreaterThan(H / 2);
  });
});
