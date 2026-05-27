# torus visualizer

Turn any local audio into beautiful 3D visuals and export for Reels, Shorts, and portfolios.

Sibling app to [torus.wtf](../web) — lives at `visualizer.torus.wtf` in production.

## Free vs paid

| Feature | Free | Full ($10 one-time) |
| --- | --- | --- |
| All 4 presets + live preview | Yes | Yes |
| Export length | Unlimited | Unlimited |
| Export resolution | 720p | Up to 4K |
| Export FPS | 30 | Up to 240 |
| Watermark on exports | Small corner mark | None |
| Custom 3-band palette | — | Yes |
| Saved presets | — | Yes |
| Future presets | — | Free forever |

Live preview is never watermarked.

## Quick start

From the monorepo root:

```powershell
pnpm install
pnpm --filter @torus/visualizer dev
```

Open http://localhost:3001

## Environment variables

Add to the root `.env`:

```env
# Polar.sh — license key validation + checkout link
POLAR_API_KEY=
POLAR_VISUALIZER_PRODUCT_ID=
NEXT_PUBLIC_POLAR_CHECKOUT_URL=
```

### Manual Polar setup

1. Create a product: **torus visualizer — full unlock**
2. Type: one-time, $10 USD
3. Enable **license keys** as a benefit
4. Copy product ID → `POLAR_VISUALIZER_PRODUCT_ID`
5. Copy hosted checkout URL → `NEXT_PUBLIC_POLAR_CHECKOUT_URL`
6. Reuse `POLAR_API_KEY` from torus.wtf if already set

## Deploy

Deploy `apps/visualizer` to Vercel or Cloudflare Pages. Point `visualizer.torus.wtf` CNAME at the deploy target.

Build command: `pnpm --filter @torus/visualizer build`
Output: `apps/visualizer/.next`

## Audio sources

- **File** — drag-and-drop MP3/WAV/FLAC/OGG/Opus
- **Mic** — microphone or line-in
- **Tab** — Chrome/Edge tab audio via screen share (requires sharing a tab with audio)
- **Demo** — click "Try with demo audio" on the landing state (uses `public/demo.mp3`)

The bundled `public/demo.mp3` is a placeholder sine-tone sequence generated for development. Replace it with a curated royalty-free loop before launch.

## Export format

v1 exports WebM (VP9 + Opus) for broad browser support. MP4 when `MediaRecorder.isTypeSupported('video/mp4')` returns true.

## Keyboard shortcuts

- `Space` — play/pause (file mode)
- `F` — fullscreen viewport
- `R` — random preset

## License

AGPL-3.0-or-later (monorepo root). The visualizer shares `@torus/visualizers` with torus.wtf.
